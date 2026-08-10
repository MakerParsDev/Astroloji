import { describe, expect, it, vi } from 'vitest';

import { WorkersAiAdapter, type WorkersAiRunner } from '@/llm/adapters/workersAi';
import { LlmProviderError } from '@/llm/provider';

const request = {
  taskType: 'daily_content' as const,
  messages: [
    { role: 'system' as const, content: 'You are an astrology assistant.' },
    { role: 'user' as const, content: 'Write today\'s horoscope for Aries.' }
  ],
  maxOutputTokens: 200
};

describe('WorkersAiAdapter', () => {
  it('returns text and usage from a well-formed response', async () => {
    const runner: WorkersAiRunner = {
      run: vi.fn(async () => ({ response: 'Bold moves pay off today.', usage: { prompt_tokens: 42, completion_tokens: 8 } }))
    };
    const adapter = new WorkersAiAdapter(runner, '@cf/meta/llama-3.1-8b-instruct');

    const result = await adapter.generate(request);

    expect(result).toEqual({
      providerId: 'workers-ai',
      text: 'Bold moves pay off today.',
      usage: { inputTokens: 42, outputTokens: 8 }
    });
    expect(runner.run).toHaveBeenCalledWith('@cf/meta/llama-3.1-8b-instruct', {
      messages: request.messages,
      max_tokens: 200
    });
  });

  it('estimates token counts when the model response omits usage', async () => {
    const runner: WorkersAiRunner = { run: vi.fn(async () => ({ response: 'ok' })) };
    const adapter = new WorkersAiAdapter(runner, 'model');

    const result = await adapter.generate(request);

    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
  });

  it('supports a custom provider id for telemetry disambiguation', async () => {
    const runner: WorkersAiRunner = { run: vi.fn(async () => ({ response: 'ok' })) };
    const adapter = new WorkersAiAdapter(runner, 'model', 'workers-ai-free-tier');

    const result = await adapter.generate(request);

    expect(result.providerId).toBe('workers-ai-free-tier');
  });

  it('wraps runner failures in a retryable LlmProviderError', async () => {
    const runner: WorkersAiRunner = { run: vi.fn(async () => { throw new Error('binding unavailable'); }) };
    const adapter = new WorkersAiAdapter(runner, 'model');

    await expect(adapter.generate(request)).rejects.toMatchObject({
      name: 'LlmProviderError',
      providerId: 'workers-ai',
      code: 'REQUEST_FAILED',
      retryable: true
    });
  });

  it('rejects a malformed response shape as a retryable invalid-response error', async () => {
    const runner: WorkersAiRunner = { run: vi.fn(async () => ({ unexpected: true })) };
    const adapter = new WorkersAiAdapter(runner, 'model');

    const error = await adapter.generate(request).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(LlmProviderError);
    expect((error as InstanceType<typeof LlmProviderError>).code).toBe('INVALID_RESPONSE');
  });
});
