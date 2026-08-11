import { describe, expect, it, vi } from 'vitest';

import { AnthropicAdapter } from '@/llm/adapters/anthropic';
import { LlmProviderError } from '@/llm/provider';

const request = {
  taskType: 'deep_reading' as const,
  messages: [
    { role: 'system' as const, content: 'You are an astrology assistant.' },
    { role: 'user' as const, content: 'Write a deep reading for Ascendant in Leo.' }
  ],
  maxOutputTokens: 800
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('AnthropicAdapter', () => {
  it('sends the system prompt separately from user messages and the API key header', async () => {
    let capturedInit: RequestInit | undefined;
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init;
      return jsonResponse(200, {
        content: [{ type: 'text', text: 'Leo rising favors bold self-expression.' }],
        usage: { input_tokens: 120, output_tokens: 30 }
      });
    });

    const adapter = new AnthropicAdapter({ apiKey: 'sk-test', model: 'claude-opus-5', fetcher: fetcher as unknown as typeof fetch });
    const result = await adapter.generate(request);

    expect(result).toEqual({
      providerId: 'anthropic',
      text: 'Leo rising favors bold self-expression.',
      usage: { inputTokens: 120, outputTokens: 30 }
    });

    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');

    const body = JSON.parse(capturedInit?.body as string);
    expect(body.system).toBe('You are an astrology assistant.');
    expect(body.messages).toEqual([{ role: 'user', content: 'Write a deep reading for Ascendant in Leo.' }]);
    expect(body.model).toBe('claude-opus-5');
    expect(body.max_tokens).toBe(800);
  });

  it('forwards assistant turns in a multi-turn conversation instead of collapsing every role to user', async () => {
    const conversationRequest = {
      taskType: 'chat_consultation' as const,
      messages: [
        { role: 'system' as const, content: 'You are an astrology assistant.' },
        { role: 'user' as const, content: 'What does my rising sign mean?' },
        { role: 'assistant' as const, content: 'Your rising sign shapes first impressions.' },
        { role: 'user' as const, content: 'And my moon sign?' }
      ],
      maxOutputTokens: 400
    };
    let capturedInit: RequestInit | undefined;
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init;
      return jsonResponse(200, {
        content: [{ type: 'text', text: 'Your moon sign shapes your emotional world.' }],
        usage: { input_tokens: 50, output_tokens: 10 }
      });
    });
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test', model: 'claude-opus-5', fetcher: fetcher as unknown as typeof fetch });

    await adapter.generate(conversationRequest);

    const body = JSON.parse(capturedInit?.body as string);
    expect(body.messages).toEqual([
      { role: 'user', content: 'What does my rising sign mean?' },
      { role: 'assistant', content: 'Your rising sign shapes first impressions.' },
      { role: 'user', content: 'And my moon sign?' }
    ]);
  });

  it('maps HTTP 429 to a retryable rate-limit error', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 429 }));
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test', model: 'claude-opus-5', fetcher: fetcher as unknown as typeof fetch });

    await expect(adapter.generate(request)).rejects.toMatchObject({ code: 'RATE_LIMITED', retryable: true });
  });

  it('maps a non-ok, non-429 status to a retryable request-failed error', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 500 }));
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test', model: 'claude-opus-5', fetcher: fetcher as unknown as typeof fetch });

    await expect(adapter.generate(request)).rejects.toMatchObject({ code: 'REQUEST_FAILED', retryable: true });
  });

  it('rejects a response body that is not valid JSON', async () => {
    const fetcher = vi.fn(async () => new Response('not json', { status: 200 }));
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test', model: 'claude-opus-5', fetcher: fetcher as unknown as typeof fetch });

    const error = await adapter.generate(request).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LlmProviderError);
    expect((error as InstanceType<typeof LlmProviderError>).code).toBe('INVALID_RESPONSE');
  });

  it('rejects a response with no text content block', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(200, { content: [{ type: 'tool_use' }], usage: { input_tokens: 1, output_tokens: 1 } })
    );
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test', model: 'claude-opus-5', fetcher: fetcher as unknown as typeof fetch });

    await expect(adapter.generate(request)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('wraps network failures in a retryable request-failed error', async () => {
    const fetcher = vi.fn(async () => { throw new TypeError('network down'); });
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test', model: 'claude-opus-5', fetcher: fetcher as unknown as typeof fetch });

    await expect(adapter.generate(request)).rejects.toMatchObject({ code: 'REQUEST_FAILED', retryable: true });
  });
});
