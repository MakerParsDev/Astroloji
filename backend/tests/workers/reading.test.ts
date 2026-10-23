import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDecryptedBirthData, generateDeepReading } = vi.hoisted(() => ({
  getDecryptedBirthData: vi.fn(),
  generateDeepReading: vi.fn()
}));

vi.mock('@/workers/birthData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/workers/birthData')>();
  return { ...actual, getDecryptedBirthData };
});

vi.mock('@/llm/deepReadingGenerator', async () => {
  const actual = await vi.importActual<typeof import('@/llm/deepReadingGenerator')>('@/llm/deepReadingGenerator');
  return { ...actual, generateDeepReading };
});

const { Miniflare, convertV4MiniflareOptions } = createRequire(import.meta.url)('miniflare') as typeof import('miniflare');

import { createApp } from '@/index';
import { spendCreditsOnce } from '@/services/credits';
import { signAppJwt } from '@/utils/jwt';
import { createTestEnv } from '../helpers/env';

const VALID_BIRTH_DATA = {
  plaintext: { timestamp: '1990-01-15T12:00:00.000Z', latitude: 41, longitude: 29, tzid: 'Europe/Istanbul' },
  timeCertainty: 'exact' as const
};

interface CreditLedgerRow {
  id?: string;
  user_id: string;
  delta: number;
}

function createReadingDb(seed: { ledger?: CreditLedgerRow[] } = {}) {
  const ledger = [...(seed.ledger ?? [])];

  const db = {
    prepare(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      const statement = {
        bindings: [] as unknown[],
        bind(...bindings: unknown[]) {
          statement.bindings = bindings;
          return statement;
        },
        async first() {
          if (normalized.startsWith('SELECT 1 AS ok FROM users')) {
            return { ok: 1 };
          }
          if (normalized.startsWith('SELECT COALESCE(SUM(delta)')) {
            const userId = statement.bindings[0] as string;
            const balance = ledger.filter((row) => row.user_id === userId).reduce((sum, row) => sum + row.delta, 0);
            return { balance };
          }
          if (normalized.startsWith('SELECT 1 AS charged FROM credit_ledger')) {
            const [id, userId] = statement.bindings as [string, string];
            return ledger.some((row) => row.id === id && row.user_id === userId)
              ? { charged: 1 }
              : null;
          }
          if (normalized.startsWith('SELECT user_id FROM credit_ledger WHERE purchase_token')) {
            return null;
          }
          return null;
        },
        async run() {
          if (normalized.startsWith('INSERT INTO credit_ledger') && normalized.includes("'spend'")) {
            const [, userId, delta, , , balanceUserId, amount] = statement.bindings as [
              string,
              string,
              number,
              string,
              string,
              string,
              number
            ];
            const balance = ledger.filter((row) => row.user_id === balanceUserId).reduce((sum, row) => sum + row.delta, 0);
            if (balance < amount) {
              return { success: true, meta: { changes: 0 } };
            }
            if (normalized.includes('ON CONFLICT(id) DO NOTHING') &&
                ledger.some((row) => row.id === statement.bindings[0])) {
              return { success: true, meta: { changes: 0 } };
            }
            ledger.push({ id: statement.bindings[0] as string, user_id: userId, delta });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        }
      };
      return statement;
    },
    async batch() {
      return [];
    }
  } as unknown as D1Database;

  return { db, ledger };
}

function createContentBucket() {
  const stored = new Map<string, string>();
  const metadata = new Map<string, Record<string, string>>();
  let failWrites = false;
  return {
    async get(key: string) {
      const text = stored.get(key);
      if (text === undefined) return null;
      return {
        text: async () => text,
        customMetadata: metadata.get(key) ?? {}
      } as unknown as R2ObjectBody;
    },
    async put(key: string, value: string, options?: R2PutOptions) {
      if (failWrites) throw new Error('Injected R2 failure');
      const header = options?.onlyIf;
      const onlyIfNew = header instanceof Headers && header.get('If-None-Match') === '*';
      if (onlyIfNew && stored.has(key)) return null;
      stored.set(key, value);
      metadata.set(key, options?.customMetadata ?? {});
      return { key, customMetadata: options?.customMetadata ?? {} } as R2Object;
    },
    async head() {
      return { size: 1 } as R2Object;
    },
    async delete(key: string) {
      stored.delete(key);
      metadata.delete(key);
    },
    async list() {
      return { objects: [], truncated: false, cursor: undefined };
    },
    setFailWrites(value: boolean) { failWrites = value; },
    stored,
    metadata
  } as unknown as R2Bucket & {
    stored: Map<string, string>;
    metadata: Map<string, Record<string, string>>;
    setFailWrites(value: boolean): void;
  };
}

describe('reading worker', () => {
  beforeEach(() => {
    getDecryptedBirthData.mockReset();
    generateDeepReading.mockReset();
  });

  it('requires saved birth data before generating a reading', async () => {
    getDecryptedBirthData.mockResolvedValue(null);
    const { db } = createReadingDb();
    const env = createTestEnv({ DB: db, CONTENT: createContentBucket() });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: true });

    const response = await createApp().request(
      '/api/v1/reading/deep',
      { method: 'POST', headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' }, body: '{}' },
      env
    );

    expect(response.status).toBe(400);
    expect(generateDeepReading).not.toHaveBeenCalled();
  });

  it('generates and stores a reading for a premium user without spending credits', async () => {
    getDecryptedBirthData.mockResolvedValue(VALID_BIRTH_DATA);
    generateDeepReading.mockResolvedValue({ text: 'A long, personalized reading.', attempts: [] });
    const { db } = createReadingDb();
    const content = createContentBucket();
    const env = createTestEnv({ DB: db, CONTENT: content });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: true });

    const response = await createApp().request(
      '/api/v1/reading/deep',
      { method: 'POST', headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' }, body: '{}' },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      text: 'A long, personalized reading.',
      cached: false,
      credits_spent: 0
    });
    expect(content.stored.size).toBe(1);
  });

  it('spends credits for a non-premium user with sufficient balance', async () => {
    getDecryptedBirthData.mockResolvedValue(VALID_BIRTH_DATA);
    generateDeepReading.mockResolvedValue({ text: 'A long, personalized reading.', attempts: [] });
    const { db } = createReadingDb({ ledger: [{ user_id: 'user-1', delta: 40 }] });
    const env = createTestEnv({ DB: db, CONTENT: createContentBucket() });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });

    const response = await createApp().request(
      '/api/v1/reading/deep',
      { method: 'POST', headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' }, body: '{}' },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      text: 'A long, personalized reading.',
      cached: false,
      credits_spent: 30
    });
  });

  it('rejects a non-premium user without enough credits before calling the LLM', async () => {
    getDecryptedBirthData.mockResolvedValue(VALID_BIRTH_DATA);
    const { db } = createReadingDb({ ledger: [{ user_id: 'user-1', delta: 5 }] });
    const env = createTestEnv({ DB: db, CONTENT: createContentBucket() });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });

    const response = await createApp().request(
      '/api/v1/reading/deep',
      { method: 'POST', headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' }, body: '{}' },
      env
    );

    expect(response.status).toBe(402);
    expect(generateDeepReading).not.toHaveBeenCalled();
  });

  it('returns a stored reading for free on a repeat request without calling the LLM again', async () => {
    getDecryptedBirthData.mockResolvedValue(VALID_BIRTH_DATA);
    generateDeepReading.mockResolvedValue({ text: 'first reading', attempts: [] });
    const { db } = createReadingDb();
    const content = createContentBucket();
    const env = createTestEnv({ DB: db, CONTENT: content });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: true });

    const first = await createApp().request(
      '/api/v1/reading/deep',
      { method: 'POST', headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' }, body: '{}' },
      env
    );
    expect(first.status).toBe(200);

    const second = await createApp().request(
      '/api/v1/reading/deep',
      { method: 'POST', headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' }, body: '{}' },
      env
    );

    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ text: 'first reading', cached: true, credits_spent: 0 });
    expect(generateDeepReading).toHaveBeenCalledTimes(1);
  });

  it('returns 503 without spending credits when every LLM provider fails', async () => {
    getDecryptedBirthData.mockResolvedValue(VALID_BIRTH_DATA);
    generateDeepReading.mockResolvedValue({ text: null, attempts: [{ providerId: 'stub', error: 'down' }] });
    const { db, ledger } = createReadingDb({ ledger: [{ user_id: 'user-1', delta: 40 }] });
    const env = createTestEnv({ DB: db, CONTENT: createContentBucket() });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });

    const response = await createApp().request(
      '/api/v1/reading/deep',
      { method: 'POST', headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' }, body: '{}' },
      env
    );

    expect(response.status).toBe(503);
    expect(ledger.filter((row) => row.user_id === 'user-1' && row.delta < 0)).toHaveLength(0);
  });

  it('does not charge if R2 fails and charges exactly once after storage recovers', async () => {
    getDecryptedBirthData.mockResolvedValue(VALID_BIRTH_DATA);
    generateDeepReading.mockResolvedValue({ text: 'retry-safe reading', attempts: [] });
    const { db, ledger } = createReadingDb({ ledger: [{ user_id: 'user-1', delta: 40 }] });
    const content = createContentBucket();
    content.setFailWrites(true);
    const env = createTestEnv({ DB: db, CONTENT: content });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });
    const request = () => createApp().request('/api/v1/reading/deep', {
      method: 'POST',
      headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
      body: '{}'
    }, env);

    const failed = await request();
    expect(failed.status).toBe(503);
    expect(ledger).toHaveLength(1);
    expect(content.stored.size).toBe(0);

    content.setFailWrites(false);
    const succeeded = await request();
    expect(succeeded.status).toBe(200);
    await expect(succeeded.json()).resolves.toMatchObject({ cached: false, credits_spent: 30 });
    const cached = await request();
    expect(cached.status).toBe(200);
    await expect(cached.json()).resolves.toMatchObject({ cached: true, credits_spent: 0 });
    expect(ledger.filter((entry) => entry.delta === -30)).toHaveLength(1);
    expect(generateDeepReading).toHaveBeenCalledTimes(2);
  });

  it('charges only once for two concurrent requests for the same reading', async () => {
    getDecryptedBirthData.mockResolvedValue(VALID_BIRTH_DATA);
    generateDeepReading.mockResolvedValue({ text: 'one reading', attempts: [] });
    const { db, ledger } = createReadingDb({ ledger: [{ user_id: 'user-1', delta: 40 }] });
    const content = createContentBucket();
    const env = createTestEnv({ DB: db, CONTENT: content });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });
    const request = () => createApp().request('/api/v1/reading/deep', {
      method: 'POST', headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' }, body: '{}'
    }, env);
    const [first, second] = await Promise.all([request(), request()]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const bodies = await Promise.all([first.json(), second.json()]) as Array<{ credits_spent: number }>;
    expect(bodies.reduce((sum, body) => sum + body.credits_spent, 0)).toBe(30);
    expect(ledger.filter((entry) => entry.delta === -30)).toHaveLength(1);
    expect(content.stored.size).toBe(1);
  });

  it('never gives away a staged reading when balance is consumed by another request', async () => {
    getDecryptedBirthData.mockResolvedValue(VALID_BIRTH_DATA);
    generateDeepReading.mockResolvedValue({ text: 'staged reading', attempts: [] });
    const { db, ledger } = createReadingDb({ ledger: [{ user_id: 'user-1', delta: 40 }] });
    const content = createContentBucket();
    const originalPut = content.put.bind(content);
    content.put = async (...args: Parameters<typeof content.put>) => {
      const outcome = await originalPut(...args);
      ledger.push({ user_id: 'user-1', delta: -30 });
      return outcome;
    };
    const env = createTestEnv({ DB: db, CONTENT: content });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });
    const request = () => createApp().request('/api/v1/reading/deep', {
      method: 'POST', headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' }, body: '{}'
    }, env);

    expect((await request()).status).toBe(402);
    expect(content.stored.size).toBe(1);
    expect(ledger.filter((entry) => entry.id?.startsWith('deep-reading:'))).toHaveLength(0);
    expect((await request()).status).toBe(402);
    ledger.push({ user_id: 'user-1', delta: 30 });
    const paid = await request();
    expect(paid.status).toBe(200);
    await expect(paid.json()).resolves.toMatchObject({ cached: true, credits_spent: 30 });
    expect(generateDeepReading).toHaveBeenCalledTimes(1);
  });

  it('preserves previously cached legacy readings without charging again', async () => {
    getDecryptedBirthData.mockResolvedValue(VALID_BIRTH_DATA);
    const { db, ledger } = createReadingDb();
    const content = createContentBucket();
    const env = createTestEnv({ DB: db, CONTENT: content });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });
    const originalGet = content.get.bind(content);
    content.get = async (key: string) => {
      if (!content.stored.has(key)) content.stored.set(key, 'pre-upgrade reading');
      return originalGet(key);
    };
    const response = await createApp().request('/api/v1/reading/deep', {
      method: 'POST', headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' }, body: '{}'
    }, env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ cached: true, credits_spent: 0 });
    expect(ledger).toHaveLength(0);
    expect(generateDeepReading).not.toHaveBeenCalled();
  });


  it('persists once and debits once using real local D1 and R2 conditional writes', async () => {
    const runtime = new Miniflare(convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("local-qa")}}',
      compatibilityDate: '2026-04-05',
      d1Databases: { DB: 'astro-deep-reading-d1' },
      r2Buckets: { CONTENT: 'astro-deep-reading-r2' }
    }));
    try {
      const db = await runtime.getD1Database('DB');
      const content = await runtime.getR2Bucket('CONTENT') as unknown as R2Bucket;
      await db.exec([
        'CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL);',
        "INSERT INTO users (id) VALUES ('user-1');",
        "CREATE TABLE credit_ledger (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, purchase_token TEXT UNIQUE, product_id TEXT, delta INTEGER NOT NULL, reason TEXT NOT NULL CHECK (reason IN ('purchase', 'spend', 'streak_reward')), feature TEXT, created_at TEXT NOT NULL);",
        "INSERT INTO credit_ledger (id, user_id, delta, reason, created_at) VALUES ('seed', 'user-1', 40, 'purchase', '2026-08-10T00:00:00Z');"
      ].join('\n'));
      const env = createTestEnv({ DB: db, CONTENT: content });
      getDecryptedBirthData.mockResolvedValue(VALID_BIRTH_DATA);
      generateDeepReading.mockResolvedValue({ text: 'local R2 durable reading', attempts: [] });
      const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });
      const request = () => createApp().request('/api/v1/reading/deep', {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: '{}'
      }, env);

      const [first, second] = await Promise.all([request(), request()]);
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      const outputs = await Promise.all([first.json(), second.json()]) as Array<{ credits_spent: number }>;
      expect(outputs.reduce((sum, output) => sum + output.credits_spent, 0)).toBe(30);
      const keys = await content.list();
      expect(keys.objects).toHaveLength(1);
      const key = keys.objects[0]!.key;
      const original = await content.get(key);
      expect(original?.customMetadata?.billingVersion).toBe('credit-v2');
      const conditional = await content.put(key, 'overwritten?', {
        onlyIf: new Headers({ 'If-None-Match': '*' })
      });
      expect(conditional).toBeNull();
      expect(await (await content.get(key))?.text()).toBe('local R2 durable reading');

      const again = await request();
      expect(again.status).toBe(200);
      await expect(again.json()).resolves.toMatchObject({ cached: true, credits_spent: 0 });
      expect((await db.prepare('SELECT SUM(delta) AS balance FROM credit_ledger').first<{ balance: number }>())?.balance).toBe(10);
      expect((await db.prepare("SELECT COUNT(*) AS n FROM credit_ledger WHERE reason = 'spend'").first<{ n: number }>())?.n).toBe(1);
      // A future pricing change must not invalidate the previous one-time payment.
      const alreadyPaid = await spendCreditsOnce(db, {
        id: `deep-reading:${key}`,
        userId: 'user-1',
        amount: 45,
        feature: 'deep_reading',
        createdAt: '2026-10-23T00:00:00Z'
      });
      expect(alreadyPaid).toEqual({ status: 'already_spent', balance: 10 });
      expect((await db.prepare("SELECT COUNT(*) AS n FROM credit_ledger WHERE reason = 'spend'").first<{ n: number }>())?.n).toBe(1);
    } finally {
      await runtime.dispose();
    }
  });

});
