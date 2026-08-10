import { describe, expect, it } from 'vitest';

import { buildLlmCacheKey, buildLlmContentR2Key, getCachedLlmText, putCachedLlmText } from '@/llm/cache';

function createFakeKv() {
  const store = new Map<string, string>();
  const puts: Array<{ key: string; value: string }> = [];
  return {
    namespace: {
      async get(key: string) {
        return store.get(key) ?? null;
      },
      async put(key: string, value: string) {
        store.set(key, value);
        puts.push({ key, value });
      },
      async delete(key: string) {
        store.delete(key);
      }
    } as unknown as KVNamespace,
    puts
  };
}

function createFakeR2(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    async get(key: string) {
      const value = store.get(key);
      if (value === undefined) return null;
      return { async text() { return value; } } as unknown as R2ObjectBody;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    }
  } as unknown as R2Bucket;
}

describe('buildLlmCacheKey', () => {
  it('is deterministic and namespaced by task type', async () => {
    const input = {
      promptVersion: 'v1',
      taskType: 'daily_content' as const,
      chartFingerprint: 'fp-123',
      date: '2026-08-10',
      language: 'en'
    };

    const first = await buildLlmCacheKey(input);
    const same = await buildLlmCacheKey(input);

    expect(first).toBe(same);
    expect(first).toMatch(/^llm:daily_content:[0-9a-f]{64}$/);
  });

  it('changes when the prompt version changes, invalidating old entries', async () => {
    const base = {
      taskType: 'daily_content' as const,
      chartFingerprint: 'fp-123',
      date: '2026-08-10',
      language: 'en'
    };

    const v1 = await buildLlmCacheKey({ ...base, promptVersion: 'v1' });
    const v2 = await buildLlmCacheKey({ ...base, promptVersion: 'v2' });

    expect(v1).not.toBe(v2);
  });

  it('changes when the chart fingerprint, date, or language differ', async () => {
    const base = { promptVersion: 'v1', taskType: 'daily_content' as const, chartFingerprint: 'fp-a', date: '2026-08-10', language: 'en' };

    const byChart = await buildLlmCacheKey({ ...base, chartFingerprint: 'fp-b' });
    const byDate = await buildLlmCacheKey({ ...base, date: '2026-08-11' });
    const byLanguage = await buildLlmCacheKey({ ...base, language: 'tr' });
    const original = await buildLlmCacheKey(base);

    expect(byChart).not.toBe(original);
    expect(byDate).not.toBe(original);
    expect(byLanguage).not.toBe(original);
  });
});

describe('getCachedLlmText / putCachedLlmText', () => {
  it('returns null on a total cache miss', async () => {
    const kv = createFakeKv();
    const r2 = createFakeR2();

    await expect(getCachedLlmText({ CACHE: kv.namespace, CONTENT: r2 }, 'llm:daily_content:missing')).resolves.toBeNull();
  });

  it('writes through both KV and R2, then reads from the KV hot path', async () => {
    const kv = createFakeKv();
    const r2 = createFakeR2();
    const cacheKey = await buildLlmCacheKey({
      promptVersion: 'v1',
      taskType: 'daily_content',
      chartFingerprint: 'fp-1',
      date: '2026-08-10',
      language: 'en'
    });

    await putCachedLlmText({ CACHE: kv.namespace, CONTENT: r2 }, cacheKey, 'generated content');

    await expect(getCachedLlmText({ CACHE: kv.namespace, CONTENT: r2 }, cacheKey)).resolves.toBe('generated content');
  });

  it('falls through to R2 on a KV miss and repopulates KV', async () => {
    const kv = createFakeKv();
    const cacheKey = 'llm:daily_content:seeded';
    const r2 = createFakeR2({ [buildLlmContentR2Key(cacheKey)]: 'from r2' });

    const result = await getCachedLlmText({ CACHE: kv.namespace, CONTENT: r2 }, cacheKey);

    expect(result).toBe('from r2');
    expect(kv.puts).toEqual([{ key: cacheKey, value: 'from r2' }]);
  });
});
