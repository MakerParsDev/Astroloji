import { describe, expect, it } from 'vitest';

import { getCreditBalance, grantCreditsForPurchase, spendCredits } from '@/services/credits';
import type { CreditLedgerRow } from '@/types';

interface FakeDb {
  db: D1Database;
  rows: CreditLedgerRow[];
}

function createFakeCreditLedgerDb(seed: CreditLedgerRow[] = []): FakeDb {
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
            const [id, userId, purchaseToken, productId, delta, createdAt] = statement.bindings as [
              string,
              string,
              string,
              string,
              number,
              string
            ];
            if (rows.some((row) => row.purchase_token === purchaseToken)) {
              throw new Error('UNIQUE constraint failed: credit_ledger.purchase_token');
            }
            rows.push({
              id,
              user_id: userId,
              purchase_token: purchaseToken,
              product_id: productId,
              delta,
              reason: 'purchase',
              feature: null,
              created_at: createdAt
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith('INSERT INTO credit_ledger') && normalized.includes("'spend'")) {
            const [id, userId, delta, feature, createdAt, balanceUserId, amount] = statement.bindings as [
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
            rows.push({
              id,
              user_id: userId,
              purchase_token: null,
              product_id: null,
              delta,
              reason: 'spend',
              feature,
              created_at: createdAt
            });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        }
      };
      return statement;
    }
  } as unknown as D1Database;

  return { db, rows };
}

describe('getCreditBalance', () => {
  it('sums all ledger entries for the user', async () => {
    const { db } = createFakeCreditLedgerDb([
      row({ user_id: 'u1', delta: 20 }),
      row({ user_id: 'u1', delta: -5 }),
      row({ user_id: 'u2', delta: 100 })
    ]);

    await expect(getCreditBalance(db, 'u1')).resolves.toBe(15);
  });

  it('returns zero for a user with no ledger entries', async () => {
    const { db } = createFakeCreditLedgerDb([]);

    await expect(getCreditBalance(db, 'unknown')).resolves.toBe(0);
  });
});

describe('grantCreditsForPurchase', () => {
  it('grants the credits mapped to the product and records the purchase token', async () => {
    const { db, rows } = createFakeCreditLedgerDb([]);

    const result = await grantCreditsForPurchase(db, {
      id: 'ledger-1',
      userId: 'u1',
      purchaseToken: 'token-1',
      productId: 'credits_medium',
      createdAt: '2026-08-11T00:00:00.000Z'
    });

    expect(result).toEqual({ status: 'granted', creditsGranted: 60, balance: 60 });
    expect(rows).toHaveLength(1);
    expect(rows[0].purchase_token).toBe('token-1');
  });

  it('is idempotent when the same purchase token is verified twice by the same user', async () => {
    const { db } = createFakeCreditLedgerDb([
      row({ user_id: 'u1', purchase_token: 'token-1', product_id: 'credits_medium', delta: 60 })
    ]);

    const result = await grantCreditsForPurchase(db, {
      id: 'ledger-2',
      userId: 'u1',
      purchaseToken: 'token-1',
      productId: 'credits_medium',
      createdAt: '2026-08-11T00:00:01.000Z'
    });

    expect(result).toEqual({ status: 'duplicate', balance: 60 });
  });

  it('refuses to grant when the purchase token belongs to a different user', async () => {
    const { db } = createFakeCreditLedgerDb([
      row({ user_id: 'u1', purchase_token: 'token-1', product_id: 'credits_medium', delta: 60 })
    ]);

    const result = await grantCreditsForPurchase(db, {
      id: 'ledger-2',
      userId: 'u2',
      purchaseToken: 'token-1',
      productId: 'credits_medium',
      createdAt: '2026-08-11T00:00:01.000Z'
    });

    expect(result).toEqual({ status: 'conflict' });
  });
});

describe('spendCredits', () => {
  it('debits the balance atomically when sufficient credits are available', async () => {
    const { db, rows } = createFakeCreditLedgerDb([row({ user_id: 'u1', delta: 20 })]);

    const result = await spendCredits(db, {
      id: 'ledger-2',
      userId: 'u1',
      amount: 15,
      feature: 'deep_reading',
      createdAt: '2026-08-11T00:00:01.000Z'
    });

    expect(result).toEqual({ status: 'spent', balance: 5 });
    expect(rows).toHaveLength(2);
  });

  it('refuses to spend below zero and leaves the balance unchanged', async () => {
    const { db, rows } = createFakeCreditLedgerDb([row({ user_id: 'u1', delta: 10 })]);

    const result = await spendCredits(db, {
      id: 'ledger-2',
      userId: 'u1',
      amount: 15,
      feature: 'deep_reading',
      createdAt: '2026-08-11T00:00:01.000Z'
    });

    expect(result).toEqual({ status: 'insufficient_balance', balance: 10 });
    expect(rows).toHaveLength(1);
  });
});

function row(overrides: Partial<CreditLedgerRow>): CreditLedgerRow {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    user_id: overrides.user_id ?? 'u1',
    purchase_token: overrides.purchase_token ?? null,
    product_id: overrides.product_id ?? null,
    delta: overrides.delta ?? 0,
    reason: overrides.reason ?? (overrides.delta && overrides.delta < 0 ? 'spend' : 'purchase'),
    feature: overrides.feature ?? null,
    created_at: overrides.created_at ?? '2026-08-11T00:00:00.000Z'
  };
}
