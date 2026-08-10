import { describe, expect, it, vi } from 'vitest';

import { OpenAiCompatibleAdapter } from '@/llm/adapters/openaiCompatible';
import { LlmProviderError } from '@/llm/provider';

const request = {
  taskType: 'chat_consultation' as const,
  messages: [
    { role: 'system' as const, content: 'You are an astrology assistant.' },
    { role: 'user' as const, content: 'What does my Saturn return mean?' }
  ],
  maxOutputTokens: 300
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('OpenAiCompatibleAdapter', () => {
  it('posts to <baseUrl>/chat/completions with a bearer token and parses the response', async () => {
    let capturedUrl: RequestInfo | URL | undefined;
    let capturedInit: RequestInit | undefined;
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonResponse(200, {
        choices: [{ message: { content: 'A Saturn return marks structural maturity.' } }],
        usage: { prompt_tokens: 50, completion_tokens: 12 }
      });
    });

    const adapter = new OpenAiCompatibleAdapter({
      providerId: 'nvidia-nim',
      apiKey: 'nim-key',
      model: 'meta/llama-3.1-70b-instruct',
      baseUrl: 'https://integrate.api.nvidia.com/v1/',
      fetcher: fetcher as unknown as typeof fetch
    });

    const result = await adapter.generate(request);

    expect(capturedUrl).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer nim-key');

    expect(result).toEqual({
      providerId: 'nvidia-nim',
      text: 'A Saturn return marks structural maturity.',
      usage: { inputTokens: 50, outputTokens: 12 }
    });
  });

  it('trims a trailing slash so the endpoint is not double-slashed', async () => {
    let capturedUrl: RequestInfo | URL | undefined;
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      capturedUrl = url;
      return jsonResponse(200, { choices: [{ message: { content: 'ok' } }] });
    });

    const adapter = new OpenAiCompatibleAdapter({
      providerId: 'groq',
      apiKey: 'k',
      model: 'llama-3.1-8b-instant',
      baseUrl: 'https://api.groq.com/openai/v1',
      fetcher: fetcher as unknown as typeof fetch
    });

    await adapter.generate(request);

    expect(capturedUrl).toBe('https://api.groq.com/openai/v1/chat/completions');
  });

  it('estimates tokens when the response omits a usage block', async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { choices: [{ message: { content: 'a short reply' } }] }));
    const adapter = new OpenAiCompatibleAdapter({
      providerId: 'deepseek',
      apiKey: 'k',
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com/v1',
      fetcher: fetcher as unknown as typeof fetch
    });

    const result = await adapter.generate(request);

    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
  });

  it('maps HTTP 429 to a retryable rate-limit error', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 429 }));
    const adapter = new OpenAiCompatibleAdapter({
      providerId: 'groq',
      apiKey: 'k',
      model: 'm',
      baseUrl: 'https://api.groq.com/openai/v1',
      fetcher: fetcher as unknown as typeof fetch
    });

    await expect(adapter.generate(request)).rejects.toMatchObject({ code: 'RATE_LIMITED', retryable: true, providerId: 'groq' });
  });

  it('rejects a response with no choices content', async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { choices: [{ message: {} }] }));
    const adapter = new OpenAiCompatibleAdapter({
      providerId: 'together',
      apiKey: 'k',
      model: 'm',
      baseUrl: 'https://api.together.xyz/v1',
      fetcher: fetcher as unknown as typeof fetch
    });

    const error = await adapter.generate(request).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LlmProviderError);
    expect((error as InstanceType<typeof LlmProviderError>).code).toBe('INVALID_RESPONSE');
  });
});
