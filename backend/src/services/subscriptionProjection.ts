import type { SubscriptionStatus } from '@/types';

/**
 * The user has one effective Premium projection but can own multiple Play
 * purchase tokens after a plan replacement. Always derive that projection
 * from all currently eligible tokens, not the last notification processed.
 *
 * This statement runs after the token upsert inside the same D1 batch.
 * Every optional guard is a fixed internal SQL fragment, never user input.
 */
export function createPremiumProjectionStatement(
  db: D1Database,
  input: {
    userId: string;
    now: string;
    fallbackStatus: SubscriptionStatus;
    fallbackExpiresAt: string | null;
    guardSql?: string;
    guardBindings?: unknown[];
  }
): D1PreparedStatement {
  const activeSubscription = `FROM subscriptions
    WHERE user_id = users.id
      AND status IN ('active', 'cancelled', 'grace_period')
      AND expires_at > ?`;
  const sql = `UPDATE users SET
    is_premium = CASE WHEN EXISTS (SELECT 1 ${activeSubscription}) THEN 1 ELSE 0 END,
    subscription_state = COALESCE(
      (SELECT status ${activeSubscription} ORDER BY expires_at DESC LIMIT 1), ?
    ),
    premium_expires_at = COALESCE(
      (SELECT expires_at ${activeSubscription} ORDER BY expires_at DESC LIMIT 1), ?
    ),
    last_seen_at = ?
    WHERE id = ? AND ${input.guardSql ?? '1=1'}`;

  return db.prepare(sql).bind(
    input.now,
    input.now, input.fallbackStatus,
    input.now, input.fallbackExpiresAt,
    input.now, input.userId,
    ...(input.guardBindings ?? [])
  );
}
