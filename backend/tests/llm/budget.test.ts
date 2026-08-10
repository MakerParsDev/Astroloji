import { describe, expect, it } from 'vitest';

import { checkLlmBudget, recordLlmUsage } from '@/llm/budget';

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

describe('checkLlmBudget', () => {
  it('allows the request with full remaining budget when nothing has been recorded', async () => {
    const cache = createFakeKv();

    await expect(checkLlmBudget({ CACHE: cache }, 'user-1', '2026-08-10', { dailyTokenLimit: 1000 })).resolves.toEqual({
      allowed: true,
      usedTokens: 0,
      remainingTokens: 1000
    });
  });

  it('reflects recorded usage and denies once the daily limit is reached', async () => {
    const cache = createFakeKv();

    await recordLlmUsage({ CACHE: cache }, 'user-1', '2026-08-10', 600);
    await expect(checkLlmBudget({ CACHE: cache }, 'user-1', '2026-08-10', { dailyTokenLimit: 1000 })).resolves.toEqual({
      allowed: true,
      usedTokens: 600,
      remainingTokens: 400
    });

    await recordLlmUsage({ CACHE: cache }, 'user-1', '2026-08-10', 400);
    await expect(checkLlmBudget({ CACHE: cache }, 'user-1', '2026-08-10', { dailyTokenLimit: 1000 })).resolves.toEqual({
      allowed: false,
      usedTokens: 1000,
      remainingTokens: 0
    });
  });

  it('isolates usage per user and per day', async () => {
    const cache = createFakeKv();

    await recordLlmUsage({ CACHE: cache }, 'user-1', '2026-08-10', 900);

    await expect(checkLlmBudget({ CACHE: cache }, 'user-2', '2026-08-10', { dailyTokenLimit: 1000 })).resolves.toMatchObject({
      usedTokens: 0
    });
    await expect(checkLlmBudget({ CACHE: cache }, 'user-1', '2026-08-11', { dailyTokenLimit: 1000 })).resolves.toMatchObject({
      usedTokens: 0
    });
  });
});

describe('recordLlmUsage', () => {
  it('accumulates across multiple calls', async () => {
    const cache = createFakeKv();

    await recordLlmUsage({ CACHE: cache }, 'user-1', '2026-08-10', 100);
    await recordLlmUsage({ CACHE: cache }, 'user-1', '2026-08-10', 50);

    await expect(checkLlmBudget({ CACHE: cache }, 'user-1', '2026-08-10', { dailyTokenLimit: 1000 })).resolves.toMatchObject({
      usedTokens: 150
    });
  });

  it('rejects negative or non-integer token counts', async () => {
    const cache = createFakeKv();

    await expect(recordLlmUsage({ CACHE: cache }, 'user-1', '2026-08-10', -1)).rejects.toThrow(RangeError);
    await expect(recordLlmUsage({ CACHE: cache }, 'user-1', '2026-08-10', 1.5)).rejects.toThrow(RangeError);
  });
});
