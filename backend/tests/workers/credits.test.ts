import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyProductPurchaseMock, consumeProductPurchaseMock } = vi.hoisted(() => ({
  verifyProductPurchaseMock: vi.fn(),
  consumeProductPurchaseMock: vi.fn()
}));

vi.mock('@/services/playBilling', async () => {
  const actual = await vi.importActual<typeof import('@/services/playBilling')>('@/services/playBilling');
  return {
    ...actual,
    verifyProductPurchase: verifyProductPurchaseMock,
    consumeProductPurchase: consumeProductPurchaseMock
  };
});

import { createApp } from '@/index';
import { signAppJwt } from '@/utils/jwt';
import { createTestEnv } from '../helpers/env';

interface LedgerRow {
  id: string;
  user_id: string;
  purchase_token: string | null;
  delta: number;
}

function createCreditLedgerDb(seed: LedgerRow[] = []) {
  const rows = [...seed];

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
            const balance = rows.filter((row) => row.user_id === userId).reduce((sum, row) => sum + row.delta, 0);
            return { balance };
          }
          if (normalized.startsWith('SELECT user_id FROM credit_ledger WHERE purchase_token')) {
            const purchaseToken = statement.bindings[0] as string;
            const row = rows.find((candidate) => candidate.purchase_token === purchaseToken);
            return row ? { user_id: row.user_id } : null;
          }
          return null;
        },
        async run() {
          if (normalized.startsWith('INSERT INTO credit_ledger') && normalized.includes("'purchase'")) {
            const [id, userId, purchaseToken, , delta] = statement.bindings as [
              string,
              string,
              string,
              string,
              number
            ];
            if (rows.some((row) => row.purchase_token === purchaseToken)) {
              throw new Error('UNIQUE constraint failed: credit_ledger.purchase_token');
            }
            rows.push({ id, user_id: userId, purchase_token: purchaseToken, delta });
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith('INSERT INTO credit_ledger') && normalized.includes("'spend'")) {
            const [id, userId, delta, , , balanceUserId, amount] = statement.bindings as [
              string,
              string,
              number,
              string,
              string,
              string,
              number
            ];
            const balance = rows
              .filter((row) => row.user_id === balanceUserId)
              .reduce((sum, row) => sum + row.delta, 0);
            if (balance < amount) {
              return { success: true, meta: { changes: 0 } };
            }
            rows.push({ id, user_id: userId, purchase_token: null, delta });
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

  return { db, rows };
}

describe('credits worker', () => {
  beforeEach(() => {
    verifyProductPurchaseMock.mockReset();
    consumeProductPurchaseMock.mockReset().mockResolvedValue(undefined);
  });

  it('grants credits for a valid, unconsumed purchase and marks it consumed', async () => {
    const { db, rows } = createCreditLedgerDb();
    const env = createTestEnv({ DB: db, PACKAGE_NAME: 'com.parsfilo.astrology' });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });
    verifyProductPurchaseMock.mockResolvedValue({ purchaseState: 0, consumptionState: 0 });

    const response = await createApp().request(
      '/api/v1/credits/verify',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ purchase_token: 'token-1', product_id: 'credits_medium' })
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      duplicate: false,
      credits_granted: 60,
      balance: 60
    });
    expect(rows).toHaveLength(1);
    expect(consumeProductPurchaseMock).toHaveBeenCalledWith(env, 'token-1', 'credits_medium', 'com.parsfilo.astrology');
  });

  it('rejects a purchase that Play reports as not yet purchased', async () => {
    const { db } = createCreditLedgerDb();
    const env = createTestEnv({ DB: db, PACKAGE_NAME: 'com.parsfilo.astrology' });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });
    verifyProductPurchaseMock.mockResolvedValue({ purchaseState: 2, consumptionState: 0 });

    const response = await createApp().request(
      '/api/v1/credits/verify',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ purchase_token: 'token-1', product_id: 'credits_medium' })
      },
      env
    );

    expect(response.status).toBe(400);
    expect(consumeProductPurchaseMock).not.toHaveBeenCalled();
  });

  it('does not double-grant when the same purchase token is verified twice', async () => {
    const { db } = createCreditLedgerDb([{ id: 'l1', user_id: 'user-1', purchase_token: 'token-1', delta: 60 }]);
    const env = createTestEnv({ DB: db, PACKAGE_NAME: 'com.parsfilo.astrology' });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });
    verifyProductPurchaseMock.mockResolvedValue({ purchaseState: 0, consumptionState: 0 });

    const response = await createApp().request(
      '/api/v1/credits/verify',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ purchase_token: 'token-1', product_id: 'credits_medium' })
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      duplicate: true,
      credits_granted: 0,
      balance: 60
    });
  });

  it('rejects a purchase token that belongs to another user', async () => {
    const { db } = createCreditLedgerDb([{ id: 'l1', user_id: 'user-2', purchase_token: 'token-1', delta: 60 }]);
    const env = createTestEnv({ DB: db, PACKAGE_NAME: 'com.parsfilo.astrology' });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });
    verifyProductPurchaseMock.mockResolvedValue({ purchaseState: 0, consumptionState: 0 });

    const response = await createApp().request(
      '/api/v1/credits/verify',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ purchase_token: 'token-1', product_id: 'credits_medium' })
      },
      env
    );

    expect(response.status).toBe(409);
  });

  it('spends credits atomically and reports the remaining balance', async () => {
    const { db } = createCreditLedgerDb([{ id: 'l1', user_id: 'user-1', purchase_token: 'token-1', delta: 60 }]);
    const env = createTestEnv({ DB: db });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });

    const response = await createApp().request(
      '/api/v1/credits/spend',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ amount: 10, feature: 'deep_reading' })
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, balance: 50 });
  });

  it('refuses to spend more credits than the user has', async () => {
    const { db } = createCreditLedgerDb([{ id: 'l1', user_id: 'user-1', purchase_token: 'token-1', delta: 5 }]);
    const env = createTestEnv({ DB: db });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });

    const response = await createApp().request(
      '/api/v1/credits/spend',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ amount: 10, feature: 'deep_reading' })
      },
      env
    );

    expect(response.status).toBe(402);
  });

  it('reports the current balance without mutating the ledger', async () => {
    const { db } = createCreditLedgerDb([{ id: 'l1', user_id: 'user-1', purchase_token: 'token-1', delta: 30 }]);
    const env = createTestEnv({ DB: db });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });

    const response = await createApp().request(
      '/api/v1/credits/balance',
      { headers: { authorization: `Bearer ${jwt}` } },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ balance: 30 });
  });
});
