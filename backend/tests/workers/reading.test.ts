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

import { createApp } from '@/index';
import { signAppJwt } from '@/utils/jwt';
import { createTestEnv } from '../helpers/env';

const VALID_BIRTH_DATA = {
  plaintext: { timestamp: '1990-01-15T12:00:00.000Z', latitude: 41, longitude: 29, tzid: 'Europe/Istanbul' },
  timeCertainty: 'exact' as const
};

interface CreditLedgerRow {
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
            ledger.push({ user_id: userId, delta });
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
  return {
    async get(key: string) {
      const text = stored.get(key);
      if (text === undefined) return null;
      return { text: async () => text } as unknown as R2ObjectBody;
    },
    async put(key: string, value: string) {
      stored.set(key, value);
    },
    async head() {
      return { size: 1 } as R2Object;
    },
    async delete(key: string) {
      stored.delete(key);
    },
    async list() {
      return { objects: [], truncated: false, cursor: undefined };
    },
    stored
  } as unknown as R2Bucket & { stored: Map<string, string> };
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
});
