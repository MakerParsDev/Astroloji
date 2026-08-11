import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDecryptedBirthData, generateChatReply } = vi.hoisted(() => ({
  getDecryptedBirthData: vi.fn(),
  generateChatReply: vi.fn()
}));

vi.mock('@/workers/birthData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/workers/birthData')>();
  return { ...actual, getDecryptedBirthData };
});

vi.mock('@/llm/chatConsultationGenerator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/llm/chatConsultationGenerator')>();
  return { ...actual, generateChatReply };
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

function createChatDb(seed: { ledger?: CreditLedgerRow[] } = {}) {
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

describe('chat worker', () => {
  beforeEach(() => {
    getDecryptedBirthData.mockReset();
    generateChatReply.mockReset();
  });

  it('rejects a message when the user has fewer credits than the per-turn cost', async () => {
    const { db } = createChatDb({ ledger: [{ user_id: 'user-1', delta: 2 }] });
    const env = createTestEnv({ DB: db });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: true });

    const response = await createApp().request(
      '/api/v1/chat/message',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'What does my chart say?' })
      },
      env
    );

    expect(response.status).toBe(402);
    expect(getDecryptedBirthData).not.toHaveBeenCalled();
  });

  it('requires saved birth data even for a user with enough credits', async () => {
    getDecryptedBirthData.mockResolvedValue(null);
    const { db } = createChatDb({ ledger: [{ user_id: 'user-1', delta: 20 }] });
    const env = createTestEnv({ DB: db });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: true });

    const response = await createApp().request(
      '/api/v1/chat/message',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'What does my chart say?' })
      },
      env
    );

    expect(response.status).toBe(400);
    expect(generateChatReply).not.toHaveBeenCalled();
  });

  it('spends credits every turn even for a premium user', async () => {
    getDecryptedBirthData.mockResolvedValue(VALID_BIRTH_DATA);
    generateChatReply.mockResolvedValue({ reply: 'Your rising sign shapes first impressions.', attempts: [] });
    const { db, ledger } = createChatDb({ ledger: [{ user_id: 'user-1', delta: 20 }] });
    const env = createTestEnv({ DB: db });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: true });

    const response = await createApp().request(
      '/api/v1/chat/message',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'What does my rising sign mean?' })
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reply: 'Your rising sign shapes first impressions.',
      balance: 15
    });
    expect(ledger.some((row) => row.delta === -5)).toBe(true);
  });

  it('forwards conversation history to the generator in order', async () => {
    getDecryptedBirthData.mockResolvedValue(VALID_BIRTH_DATA);
    generateChatReply.mockResolvedValue({ reply: 'follow-up answer', attempts: [] });
    const { db } = createChatDb({ ledger: [{ user_id: 'user-1', delta: 20 }] });
    const env = createTestEnv({ DB: db });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: true });

    await createApp().request(
      '/api/v1/chat/message',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'follow-up question',
          history: [
            { role: 'user', content: 'first question' },
            { role: 'assistant', content: 'first answer' }
          ]
        })
      },
      env
    );

    expect(generateChatReply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        message: 'follow-up question',
        history: [
          { role: 'user', content: 'first question' },
          { role: 'assistant', content: 'first answer' }
        ]
      })
    );
  });

  it('returns 503 without spending credits when every LLM provider fails', async () => {
    getDecryptedBirthData.mockResolvedValue(VALID_BIRTH_DATA);
    generateChatReply.mockResolvedValue({ reply: null, attempts: [{ providerId: 'stub', error: 'down' }] });
    const { db, ledger } = createChatDb({ ledger: [{ user_id: 'user-1', delta: 20 }] });
    const env = createTestEnv({ DB: db });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: true });

    const response = await createApp().request(
      '/api/v1/chat/message',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'hello' })
      },
      env
    );

    expect(response.status).toBe(503);
    expect(ledger.filter((row) => row.delta < 0)).toHaveLength(0);
  });
});
