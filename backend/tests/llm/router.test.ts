import { describe, expect, it, vi } from 'vitest';

import { checkLlmBudget } from '@/llm/budget';
import { LlmProviderError, type LlmGenerateRequest, type LlmGenerateResult, type LlmProvider } from '@/llm/provider';
import { routeLlmGenerate, routeLlmGenerateForUser } from '@/llm/router';

const request: LlmGenerateRequest = {
  taskType: 'daily_content',
  messages: [{ role: 'user', content: 'hello' }],
  maxOutputTokens: 100
};

function createFakeKv() {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    }
  } as unknown as KVNamespace;
}

function successProvider(id: string, result: Partial<LlmGenerateResult> = {}): LlmProvider {
  return {
    id,
    generate: vi.fn(
      async (): Promise<LlmGenerateResult> => ({
        providerId: id,
        text: 'ok',
        usage: { inputTokens: 10, outputTokens: 5 },
        ...result
      })
    )
  };
}

function failingProvider(id: string, error: Error = new LlmProviderError(id, 'REQUEST_FAILED', true, `${id} failed`)): LlmProvider {
  return {
    id,
    generate: vi.fn(async () => {
      throw error;
    })
  };
}

describe('routeLlmGenerate', () => {
  it('returns the first successful provider without calling subsequent ones', async () => {
    const first = successProvider('primary');
    const second = successProvider('secondary');

    const routed = await routeLlmGenerate([first, second], request);

    expect(routed.result?.providerId).toBe('primary');
    expect(routed.attempts).toEqual([]);
    expect(second.generate).not.toHaveBeenCalled();
  });

  it('falls through to the next provider on a provider error and records the attempt', async () => {
    const first = failingProvider('primary');
    const second = successProvider('secondary');

    const routed = await routeLlmGenerate([first, second], request);

    expect(routed.result?.providerId).toBe('secondary');
    expect(routed.attempts).toEqual([{ providerId: 'primary', error: 'primary failed' }]);
  });

  it('falls through on a plain (non-LlmProviderError) exception too', async () => {
    const first = failingProvider('primary', new Error('unexpected crash'));
    const second = successProvider('secondary');

    const routed = await routeLlmGenerate([first, second], request);

    expect(routed.result?.providerId).toBe('secondary');
    expect(routed.attempts).toEqual([{ providerId: 'primary', error: 'unexpected crash' }]);
  });

  it('returns a null result with every attempt recorded when all providers fail', async () => {
    const first = failingProvider('primary');
    const second = failingProvider('secondary');

    const routed = await routeLlmGenerate([first, second], request);

    expect(routed.result).toBeNull();
    expect(routed.attempts.map((attempt) => attempt.providerId)).toEqual(['primary', 'secondary']);
  });

  it('returns a null result for an empty provider chain', async () => {
    const routed = await routeLlmGenerate([], request);

    expect(routed).toEqual({ result: null, attempts: [] });
  });
});

describe('routeLlmGenerateForUser', () => {
  it('records token usage against the budget on success', async () => {
    const cache = createFakeKv();
    const provider = successProvider('primary', { usage: { inputTokens: 20, outputTokens: 10 } });

    const routed = await routeLlmGenerateForUser({ CACHE: cache }, [provider], 'user-1', '2026-08-10', request);

    expect(routed.result?.providerId).toBe('primary');
    await expect(
      checkLlmBudget({ CACHE: cache }, 'user-1', '2026-08-10', { dailyTokenLimit: 1000 })
    ).resolves.toMatchObject({ usedTokens: 30 });
  });

  it('does not record usage when every provider fails', async () => {
    const cache = createFakeKv();
    const provider = failingProvider('primary');

    const routed = await routeLlmGenerateForUser({ CACHE: cache }, [provider], 'user-1', '2026-08-10', request);

    expect(routed.result).toBeNull();
    await expect(
      checkLlmBudget({ CACHE: cache }, 'user-1', '2026-08-10', { dailyTokenLimit: 1000 })
    ).resolves.toMatchObject({ usedTokens: 0 });
  });
});
