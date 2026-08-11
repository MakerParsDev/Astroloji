import { CREDIT_PRODUCTS, type CreditProductId } from '@/types';

export async function getCreditBalance(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COALESCE(SUM(delta), 0) AS balance FROM credit_ledger WHERE user_id = ?')
    .bind(userId)
    .first<{ balance: number }>();
  return row?.balance ?? 0;
}

async function findPurchaseTokenOwner(db: D1Database, purchaseToken: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT user_id FROM credit_ledger WHERE purchase_token = ?')
    .bind(purchaseToken)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

export interface GrantCreditsForPurchaseInput {
  id: string;
  userId: string;
  purchaseToken: string;
  productId: CreditProductId;
  createdAt: string;
}

export type GrantCreditsResult =
  | { status: 'granted'; creditsGranted: number; balance: number }
  | { status: 'duplicate'; balance: number }
  | { status: 'conflict' };

/**
 * Idempotent on purchase_token: a retried verify call for the same purchase returns
 * 'duplicate' instead of double-granting. Relies on the credit_ledger.purchase_token
 * UNIQUE constraint as the race-safe backstop when two requests land concurrently.
 */
export async function grantCreditsForPurchase(
  db: D1Database,
  input: GrantCreditsForPurchaseInput
): Promise<GrantCreditsResult> {
  const creditsGranted = CREDIT_PRODUCTS[input.productId];
  const existingOwner = await findPurchaseTokenOwner(db, input.purchaseToken);
  if (existingOwner) {
    if (existingOwner !== input.userId) {
      return { status: 'conflict' };
    }
    return { status: 'duplicate', balance: await getCreditBalance(db, input.userId) };
  }

  try {
    await db
      .prepare(
        `INSERT INTO credit_ledger (id, user_id, purchase_token, product_id, delta, reason, feature, created_at)
         VALUES (?, ?, ?, ?, ?, 'purchase', NULL, ?)`
      )
      .bind(input.id, input.userId, input.purchaseToken, input.productId, creditsGranted, input.createdAt)
      .run();
  } catch {
    const owner = await findPurchaseTokenOwner(db, input.purchaseToken);
    if (owner === input.userId) {
      return { status: 'duplicate', balance: await getCreditBalance(db, input.userId) };
    }
    return { status: 'conflict' };
  }

  return { status: 'granted', creditsGranted, balance: await getCreditBalance(db, input.userId) };
}

export interface SpendCreditsInput {
  id: string;
  userId: string;
  amount: number;
  feature: string;
  createdAt: string;
}

export type SpendCreditsResult =
  | { status: 'spent'; balance: number }
  | { status: 'insufficient_balance'; balance: number };

/**
 * Atomic even under concurrent requests for the same user: the balance check and the
 * debit happen in a single INSERT...SELECT...WHERE statement, not a separate read-then-write.
 */
export async function spendCredits(db: D1Database, input: SpendCreditsInput): Promise<SpendCreditsResult> {
  const result = await db
    .prepare(
      `INSERT INTO credit_ledger (id, user_id, purchase_token, product_id, delta, reason, feature, created_at)
       SELECT ?, ?, NULL, NULL, ?, 'spend', ?, ?
       WHERE (SELECT COALESCE(SUM(delta), 0) FROM credit_ledger WHERE user_id = ?) >= ?`
    )
    .bind(input.id, input.userId, -input.amount, input.feature, input.createdAt, input.userId, input.amount)
    .run();

  const balance = await getCreditBalance(db, input.userId);
  if ((result.meta.changes ?? 0) !== 1) {
    return { status: 'insufficient_balance', balance };
  }
  return { status: 'spent', balance };
}
