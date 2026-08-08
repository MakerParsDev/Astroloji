import { Hono } from 'hono';

import { enforceKvRateLimit } from '@/services/rateLimit';
import { verifyPlayRtdnIdentity } from '@/services/playRtdnAuth';
import {
  claimPlayRtdnMessage,
  createPlayRtdnFinalizeStatement,
  finalizePlayRtdnMessage,
  fingerprintPlayRtdnMessage,
  parsePlayRtdnEnvelope,
  releasePlayRtdnClaim,
  shortPlayRtdnMessageRef,
  type ParsedPlayRtdnMessage
} from '@/services/playRtdnDelivery';
import {
  getSubscriptionStatus,
  hasPremiumEntitlement,
  listPlayReviews,
  listPlaySubscriptions,
  patchPlaySubscription,
  replyToPlayReview,
  verifySubscriptionPurchase
} from '@/services/playBilling';
import { requireAdminCapability, requirePlayWebhookAuth } from '@/middleware/auth';
import type {
  AppBindings,
  GooglePlaySubscription,
  GooglePlaySubscriptionResponse,
  SubscriptionEventType
} from '@/types';
import { validateSubscriptionBody } from '@/utils/validators';

function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

async function findSubscriptionOwner(db: D1Database, purchaseToken: string): Promise<string | null> {
  const row = (await db
    .prepare('SELECT user_id FROM subscriptions WHERE purchase_token = ?')
    .bind(purchaseToken)
    .first()) as { user_id: string } | null;
  return row?.user_id ?? null;
}

async function findUserByPurchaseToken(db: D1Database, purchaseToken: string): Promise<string | null> {
  return findSubscriptionOwner(db, purchaseToken);
}

async function writeSubscriptionEvent(
  db: D1Database,
  userId: string,
  purchaseToken: string,
  eventType: SubscriptionEventType,
  payload: unknown
) {
  await db
    .prepare(
      `INSERT INTO subscription_events (id, user_id, purchase_token, event_type, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      userId,
      purchaseToken,
      eventType,
      JSON.stringify(payload),
      new Date().toISOString()
    )
    .run();
}

async function setUserPremiumState(
  db: D1Database,
  userId: string,
  subscription: Pick<GooglePlaySubscription, 'status' | 'expiresAt'>
) {
  await db
    .prepare(
      'UPDATE users SET is_premium = ?, subscription_state = ?, premium_expires_at = ?, last_seen_at = ? WHERE id = ?'
    )
    .bind(
      hasPremiumEntitlement(subscription) ? 1 : 0,
      subscription.status,
      subscription.expiresAt,
      new Date().toISOString(),
      userId
    )
    .run();
}

async function upsertSubscription(db: D1Database, userId: string, subscription: GooglePlaySubscription) {
  const now = new Date().toISOString();
  const existing = (await db
    .prepare('SELECT id FROM subscriptions WHERE purchase_token = ?')
    .bind(subscription.purchaseToken)
    .first()) as { id: string } | null;

  if (existing) {
    await db
      .prepare(
        `UPDATE subscriptions
         SET user_id = ?, product_id = ?, status = ?, starts_at = ?, expires_at = ?, auto_renewing = ?, cancel_reason = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(
        userId,
        subscription.productId,
        subscription.status,
        subscription.startsAt,
        subscription.expiresAt,
        Number(subscription.autoRenewing),
        subscription.cancelReason,
        now,
        existing.id
      )
      .run();
    return;
  }

  await db
    .prepare(
      `INSERT INTO subscriptions
       (id, user_id, purchase_token, product_id, status, starts_at, expires_at, auto_renewing, cancel_reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      userId,
      subscription.purchaseToken,
      subscription.productId,
      subscription.status,
      subscription.startsAt,
      subscription.expiresAt,
      Number(subscription.autoRenewing),
      subscription.cancelReason,
      now,
      now
    )
    .run();
}

async function processSubscription(
  db: D1Database,
  userId: string,
  subscription: GooglePlaySubscription,
  eventType: SubscriptionEventType,
  payload: unknown
) {
  await upsertSubscription(db, userId, subscription);
  await setUserPremiumState(db, userId, subscription);
  await writeSubscriptionEvent(db, userId, subscription.purchaseToken, eventType, payload);
}

interface PlayRtdnLeaseGuard {
  messageId: string;
  fingerprint: string;
  leaseToken: string;
  checkedAt: string;
}

const RTDN_LEASE_EXISTS_SQL = `EXISTS (
  SELECT 1 FROM play_rtdn_messages
  WHERE message_id = ?
    AND message_fingerprint = ?
    AND lease_token = ?
    AND status = 'processing'
    AND lease_expires_at > ?
)`;

function createRtdnSubscriptionUpsertStatement(
  db: D1Database,
  userId: string,
  subscription: GooglePlaySubscription,
  now: string,
  guard: PlayRtdnLeaseGuard
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO subscriptions
     (id, user_id, purchase_token, product_id, status, starts_at, expires_at, auto_renewing, cancel_reason, created_at, updated_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE ${RTDN_LEASE_EXISTS_SQL}
     ON CONFLICT(purchase_token) DO UPDATE SET
       user_id = excluded.user_id,
       product_id = excluded.product_id,
       status = excluded.status,
       starts_at = excluded.starts_at,
       expires_at = excluded.expires_at,
       auto_renewing = excluded.auto_renewing,
       cancel_reason = excluded.cancel_reason,
       updated_at = excluded.updated_at`
  ).bind(
    crypto.randomUUID(), userId, subscription.purchaseToken, subscription.productId,
    subscription.status, subscription.startsAt, subscription.expiresAt,
    Number(subscription.autoRenewing), subscription.cancelReason, now, now,
    guard.messageId, guard.fingerprint, guard.leaseToken, guard.checkedAt
  );
}

function createRtdnPremiumStateStatement(
  db: D1Database,
  userId: string,
  subscription: GooglePlaySubscription,
  now: string,
  guard: PlayRtdnLeaseGuard
): D1PreparedStatement {
  return db.prepare(
    `UPDATE users
     SET is_premium = ?, subscription_state = ?, premium_expires_at = ?, last_seen_at = ?
     WHERE id = ? AND ${RTDN_LEASE_EXISTS_SQL}`
  ).bind(
    hasPremiumEntitlement(subscription) ? 1 : 0,
    subscription.status,
    subscription.expiresAt,
    now,
    userId,
    guard.messageId, guard.fingerprint, guard.leaseToken, guard.checkedAt
  );
}

function createRtdnSubscriptionEventStatement(
  db: D1Database,
  userId: string,
  purchaseToken: string,
  eventType: SubscriptionEventType,
  payload: unknown,
  createdAt: string,
  guard: PlayRtdnLeaseGuard
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO subscription_events (id, user_id, purchase_token, event_type, payload, created_at)
     SELECT ?, ?, ?, ?, ?, ?
     WHERE ${RTDN_LEASE_EXISTS_SQL}`
  ).bind(
    crypto.randomUUID(), userId, purchaseToken, eventType, JSON.stringify(payload), createdAt,
    guard.messageId, guard.fingerprint, guard.leaseToken, guard.checkedAt
  );
}

function decodedPlayRtdnPayload(parsed: ParsedPlayRtdnMessage): unknown {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(parsed.decodedBytes));
}

async function runRtdnBatch(
  db: D1Database,
  statements: D1PreparedStatement[]
): Promise<boolean> {
  const results = await db.batch(statements);
  return Number(results.at(-1)?.meta?.changes ?? 0) === 1;
}

type PlayRtdnLogOutcome =
  | 'processed'
  | 'test'
  | 'duplicate'
  | 'reconciliation_pending'
  | 'ignored_unknown_purchase'
  | 'retryable_failure'
  | 'rejected';

async function logPlayRtdnOutcome(input: {
  requestId: string;
  messageId?: string;
  auth: 'oidc' | 'legacy' | 'rejected';
  packageMatch: boolean;
  notificationClass: 'subscription' | 'test' | 'invalid';
  outcome: PlayRtdnLogOutcome;
}) {
  const messageRef = input.messageId
    ? await shortPlayRtdnMessageRef(input.messageId)
    : undefined;
  console.log({
    event: 'play_rtdn',
    requestId: input.requestId,
    ...(messageRef ? { messageRef } : {}),
    auth: input.auth,
    packageMatch: input.packageMatch,
    notificationClass: input.notificationClass,
    outcome: input.outcome
  });
}

function mapPlayEventType(notificationType: number | string): SubscriptionEventType | null {
  switch (notificationType) {
    case 'SUBSCRIPTION_PURCHASED':
    case 4:
      return 'purchased';
    case 'SUBSCRIPTION_RENEWED':
    case 2:
      return 'renewed';
    case 'SUBSCRIPTION_CANCELED':
    case 3:
      return 'cancelled';
    case 'SUBSCRIPTION_EXPIRED':
    case 13:
      return 'expired';
    case 'SUBSCRIPTION_PAUSED':
    case 10:
      return 'paused';
    case 'SUBSCRIPTION_RESTARTED':
    case 7:
      return 'restarted';
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isNotificationType(value: unknown): value is number | string {
  return typeof value === 'number' || typeof value === 'string';
}

export function decodeWebhookPayload(payload: unknown): unknown {
  if (
    isRecord(payload) &&
    'message' in payload &&
    isRecord(payload.message) &&
    'data' in payload.message &&
    typeof payload.message.data === 'string'
  ) {
    try {
      return JSON.parse(atob(payload.message.data));
    } catch {
      return payload;
    }
  }
  return payload;
}

export function extractSubscriptionNotification(payload: unknown): {
  purchaseToken?: string;
  productId?: string;
  notificationType?: number | string;
} {
  if (!isRecord(payload)) {
    return {};
  }

  const source = isRecord(payload.subscriptionNotification)
    ? payload.subscriptionNotification
    : payload;

  return {
    purchaseToken: typeof source.purchaseToken === 'string' ? source.purchaseToken : undefined,
    productId: typeof source.subscriptionId === 'string' ? source.subscriptionId : undefined,
    notificationType: isNotificationType(source.notificationType) ? source.notificationType : undefined
  };
}

export function buildFallbackSubscriptionResponse(
  productId: string,
  purchaseToken: string,
  occurredAt: string
): GooglePlaySubscriptionResponse {
  return {
    linkedPurchaseToken: purchaseToken,
    startTime: occurredAt,
    lineItems: [
      {
        productId,
        expiryTime: occurredAt
      }
    ]
  };
}

export function buildPendingReconciliationPayload(
  eventType: SubscriptionEventType,
  payload: unknown
): Record<string, unknown> {
  return {
    event_type: eventType,
    reconciliation: 'pending',
    payload
  };
}

export interface SubscriptionRouteDependencies {
  verifyPlayRtdnIdentity: typeof verifyPlayRtdnIdentity;
}

const defaultSubscriptionRouteDependencies: SubscriptionRouteDependencies = {
  verifyPlayRtdnIdentity
};

export function registerSubscriptionRoutes(
  app: Hono<AppBindings>,
  dependencies: SubscriptionRouteDependencies = defaultSubscriptionRouteDependencies
) {
  app.post('/subscriptions/verify', async (c) => {
    const userId = c.get('auth').userId;
    const allowed = await enforceKvRateLimit(c.env, `verify:${userId}`, 5, 60);
    if (!allowed) {
      return jsonError(429, 'RATE_LIMITED', 'Too many subscription verify attempts.');
    }

    const body = validateSubscriptionBody(await c.req.json());
    const ownerId = await findSubscriptionOwner(c.env.DB, body.purchase_token);
    if (ownerId && ownerId !== userId) {
      return jsonError(409, 'PURCHASE_TOKEN_CONFLICT', 'Purchase token belongs to another user.');
    }

    const subscription = await verifySubscriptionPurchase(
      c.env,
      body.purchase_token,
      body.product_id,
      c.env.PACKAGE_NAME
    );

    if (!subscription) {
      return jsonError(400, 'INVALID_PURCHASE', 'Purchase token could not be verified.');
    }

    await processSubscription(c.env.DB, userId, subscription, 'purchased', body);
    return c.json({
      is_premium: hasPremiumEntitlement(subscription),
      subscription_state: subscription.status,
      premium_expires_at: subscription.expiresAt,
      product_id: subscription.productId
    });
  });

  app.post('/subscriptions/restore', async (c) => {
    const userId = c.get('auth').userId;
    const body = validateSubscriptionBody(await c.req.json());
    const ownerId = await findSubscriptionOwner(c.env.DB, body.purchase_token);
    if (ownerId && ownerId !== userId) {
      return jsonError(409, 'PURCHASE_TOKEN_CONFLICT', 'Purchase token belongs to another user.');
    }

    const subscription = await verifySubscriptionPurchase(
      c.env,
      body.purchase_token,
      body.product_id,
      c.env.PACKAGE_NAME
    );

    if (!subscription) {
      return jsonError(400, 'INVALID_PURCHASE', 'Purchase token could not be verified.');
    }

    await processSubscription(c.env.DB, userId, subscription, 'renewed', body);
    return c.json({
      is_premium: hasPremiumEntitlement(subscription),
      subscription_state: subscription.status,
      premium_expires_at: subscription.expiresAt,
      product_id: subscription.productId
    });
  });

  app.post('/webhooks/play-rtdn', async (c) => {
    const requestId = c.get('requestId');
    const authResult = await requirePlayWebhookAuth(c, dependencies.verifyPlayRtdnIdentity);
    if (authResult instanceof Response) {
      await logPlayRtdnOutcome({
        requestId,
        auth: 'rejected',
        packageMatch: false,
        notificationClass: 'invalid',
        outcome: 'rejected'
      });
      return authResult;
    }

    let parsed: ParsedPlayRtdnMessage;
    try {
      parsed = parsePlayRtdnEnvelope(await c.req.json());
    } catch {
      await logPlayRtdnOutcome({
        requestId,
        auth: authResult.method,
        packageMatch: false,
        notificationClass: 'invalid',
        outcome: 'rejected'
      });
      return jsonError(400, 'INVALID_WEBHOOK', 'Webhook payload is invalid.');
    }

    if (parsed.packageName !== c.env.PACKAGE_NAME) {
      await logPlayRtdnOutcome({
        requestId,
        messageId: parsed.messageId,
        auth: authResult.method,
        packageMatch: false,
        notificationClass: parsed.kind,
        outcome: 'rejected'
      });
      return jsonError(400, 'INVALID_WEBHOOK', 'Webhook package identity is invalid.');
    }

    const eventType =
      parsed.kind === 'subscription' ? mapPlayEventType(parsed.notificationType) : null;
    if (parsed.kind === 'subscription' && !eventType) {
      await logPlayRtdnOutcome({
        requestId,
        messageId: parsed.messageId,
        auth: authResult.method,
        packageMatch: true,
        notificationClass: parsed.kind,
        outcome: 'rejected'
      });
      return jsonError(400, 'INVALID_WEBHOOK', 'Webhook subscription event is unsupported.');
    }

    const fingerprint = await fingerprintPlayRtdnMessage(parsed.packageName, parsed.decodedBytes);
    const leaseToken = crypto.randomUUID();
    const claimStartedAt = new Date().toISOString();
    const claimResult = await claimPlayRtdnMessage(c.env.DB, {
      messageId: parsed.messageId,
      packageName: parsed.packageName,
      fingerprint,
      notificationType: String(parsed.notificationType),
      leaseToken,
      receivedAt: claimStartedAt
    });

    if (claimResult === 'duplicate_processed') {
      await logPlayRtdnOutcome({
        requestId,
        messageId: parsed.messageId,
        auth: authResult.method,
        packageMatch: true,
        notificationClass: parsed.kind,
        outcome: 'duplicate'
      });
      return c.json({ ok: true, duplicate: true });
    }
    if (claimResult === 'duplicate_processing') {
      await logPlayRtdnOutcome({
        requestId,
        messageId: parsed.messageId,
        auth: authResult.method,
        packageMatch: true,
        notificationClass: parsed.kind,
        outcome: 'retryable_failure'
      });
      return jsonError(503, 'RTDN_IN_PROGRESS', 'Webhook delivery is still processing.');
    }
    if (claimResult === 'mismatch') {
      await logPlayRtdnOutcome({
        requestId,
        messageId: parsed.messageId,
        auth: authResult.method,
        packageMatch: true,
        notificationClass: parsed.kind,
        outcome: 'rejected'
      });
      return jsonError(409, 'RTDN_REPLAY_MISMATCH', 'Webhook delivery identity does not match.');
    }

    let claimOpen = true;
    let retryableFailureLogged = false;
    try {
      if (parsed.kind === 'test') {
        await finalizePlayRtdnMessage(c.env.DB, parsed.messageId, fingerprint, leaseToken, 'test');
        claimOpen = false;
        await logPlayRtdnOutcome({
          requestId,
          messageId: parsed.messageId,
          auth: authResult.method,
          packageMatch: true,
          notificationClass: 'test',
          outcome: 'test'
        });
        return c.json({ ok: true, test: true });
      }

      const payload = decodedPlayRtdnPayload(parsed);
      const userId = await findUserByPurchaseToken(c.env.DB, parsed.purchaseToken);
      const liveSubscription = await getSubscriptionStatus(
        c.env,
        parsed.purchaseToken,
        parsed.productId,
        c.env.PACKAGE_NAME
      );

      if (!userId && !liveSubscription) {
        await finalizePlayRtdnMessage(
          c.env.DB,
          parsed.messageId,
          fingerprint,
          leaseToken,
          'ignored_unknown_purchase'
        );
        claimOpen = false;
        await logPlayRtdnOutcome({
          requestId,
          messageId: parsed.messageId,
          auth: authResult.method,
          packageMatch: true,
          notificationClass: 'subscription',
          outcome: 'ignored_unknown_purchase'
        });
        return c.json({ ok: true });
      }

      if (!userId) {
        await releasePlayRtdnClaim(c.env.DB, parsed.messageId, fingerprint, leaseToken);
        claimOpen = false;
        await logPlayRtdnOutcome({
          requestId,
          messageId: parsed.messageId,
          auth: authResult.method,
          packageMatch: true,
          notificationClass: 'subscription',
          outcome: 'retryable_failure'
        });
        return jsonError(503, 'RTDN_OWNER_PENDING', 'Webhook subscription owner is not available.');
      }

      const now = new Date().toISOString();
      const leaseGuard: PlayRtdnLeaseGuard = {
        messageId: parsed.messageId,
        fingerprint,
        leaseToken,
        checkedAt: now
      };
      if (!liveSubscription) {
        const finalized = await runRtdnBatch(c.env.DB, [
          createRtdnSubscriptionEventStatement(
            c.env.DB,
            userId,
            parsed.purchaseToken,
            'sync_pending',
            buildPendingReconciliationPayload(eventType!, payload),
            now,
            leaseGuard
          ),
          createPlayRtdnFinalizeStatement(
            c.env.DB,
            parsed.messageId,
            fingerprint,
            leaseToken,
            'reconciliation_pending',
            now
          )
        ]);
        claimOpen = false;
        if (!finalized) {
          // A zero-row finalize is a consistency alarm, not a rollback trigger.
          // Customer-state statements are fenced by the same lease and therefore
          // also apply zero rows after ownership is lost or the lease expires.
          await logPlayRtdnOutcome({
            requestId,
            messageId: parsed.messageId,
            auth: authResult.method,
            packageMatch: true,
            notificationClass: 'subscription',
            outcome: 'retryable_failure'
          });
          retryableFailureLogged = true;
          throw new Error('Play RTDN transactional finalize guard did not match.');
        }
        await logPlayRtdnOutcome({
          requestId,
          messageId: parsed.messageId,
          auth: authResult.method,
          packageMatch: true,
          notificationClass: 'subscription',
          outcome: 'reconciliation_pending'
        });
        return c.json({ ok: true, reconciliation: 'pending' });
      }

      const finalized = await runRtdnBatch(c.env.DB, [
        createRtdnSubscriptionUpsertStatement(c.env.DB, userId, liveSubscription, now, leaseGuard),
        createRtdnPremiumStateStatement(c.env.DB, userId, liveSubscription, now, leaseGuard),
        createRtdnSubscriptionEventStatement(
          c.env.DB,
          userId,
          liveSubscription.purchaseToken,
          eventType!,
          payload,
          now,
          leaseGuard
        ),
        createPlayRtdnFinalizeStatement(
          c.env.DB,
          parsed.messageId,
          fingerprint,
          leaseToken,
          'processed',
          now
        )
      ]);
      claimOpen = false;
      if (!finalized) {
        // A zero-row finalize is a consistency alarm, not a rollback trigger.
        // Customer-state statements are fenced by the same lease and therefore
        // also apply zero rows after ownership is lost or the lease expires.
        await logPlayRtdnOutcome({
          requestId,
          messageId: parsed.messageId,
          auth: authResult.method,
          packageMatch: true,
          notificationClass: 'subscription',
          outcome: 'retryable_failure'
        });
        retryableFailureLogged = true;
        throw new Error('Play RTDN transactional finalize guard did not match.');
      }
      await logPlayRtdnOutcome({
        requestId,
        messageId: parsed.messageId,
        auth: authResult.method,
        packageMatch: true,
        notificationClass: 'subscription',
        outcome: 'processed'
      });
      return c.json({ ok: true });
    } catch {
      if (claimOpen) {
        await releasePlayRtdnClaim(c.env.DB, parsed.messageId, fingerprint, leaseToken);
      }
      if (!retryableFailureLogged) {
        await logPlayRtdnOutcome({
          requestId,
          messageId: parsed.messageId,
          auth: authResult.method,
          packageMatch: true,
          notificationClass: parsed.kind,
          outcome: 'retryable_failure'
        });
      }
      throw new Error('Play RTDN processing failed.');
    }
  });
}

export function registerSubscriptionAdminRoutes(app: Hono<AppBindings>) {
  app.get(
    '/admin/play/subscriptions',
    requireAdminCapability('play-read', 'play.subscription_list'),
    async (c) => {
    const packageName = c.req.query('package_name') ?? c.env.PACKAGE_NAME;
    const subscriptions = await listPlaySubscriptions(c.env, packageName);
    return c.json({
      ok: true,
      package_name: packageName,
      subscriptions
    });
    }
  );

  app.patch(
    '/admin/play/subscriptions/:productId',
    requireAdminCapability('play-write', 'play.subscription_update'),
    async (c) => {
    const productId = c.req.param('productId');
    const body = (await c.req.json()) as {
      apply?: boolean;
      package_name?: string;
      regions?: Array<{
        region_code: string;
        currency_code: string;
        price_micros: string;
      }>;
    };

    if (!body.regions?.length) {
      return jsonError(400, 'INVALID_REQUEST', 'At least one regional pricing config is required.');
    }

    const packageName = body.package_name ?? c.env.PACKAGE_NAME;
    const apply = body.apply === true;
    if (!apply) {
      return c.json({
        ok: true,
        dry_run: true,
        product_id: productId,
        package_name: packageName,
        regions: body.regions
      });
    }

    const result = await patchPlaySubscription(c.env, packageName, productId, {
      package_name: packageName,
      regions: body.regions
    });
    return c.json({
      ok: true,
      dry_run: false,
      product_id: productId,
      package_name: packageName,
      result
    });
    }
  );

  app.get(
    '/admin/subscriptions/audit',
    requireAdminCapability('play-write', 'play.subscription_audit'),
    async (c) => {
    const pending = (await c.env.DB
      .prepare(
        `SELECT DISTINCT purchase_token, user_id
         FROM subscription_events
         WHERE event_type = 'sync_pending'
         AND created_at > datetime('now', '-30 days')`
      )
      .all()) as {
      results?: Array<{
        purchase_token: string;
        user_id: string;
      }>;
    };

    const results = [];
    for (const row of pending.results ?? []) {
      const live =
        (await getSubscriptionStatus(
          c.env,
          row.purchase_token,
          'premium_monthly',
          c.env.PACKAGE_NAME
        )) ??
        (await getSubscriptionStatus(
          c.env,
          row.purchase_token,
          'premium_weekly',
          c.env.PACKAGE_NAME
        ));

      if (live) {
        await upsertSubscription(c.env.DB, row.user_id, live);
        await setUserPremiumState(c.env.DB, row.user_id, live);
      }

      results.push({
        user_id: row.user_id,
        purchase_token: row.purchase_token,
        status: live?.status ?? 'not_found'
      });
    }

    return c.json({
      ok: true,
      audited: results.length,
      results
    });
    }
  );

  app.get(
    '/admin/play/reviews',
    requireAdminCapability('play-read', 'play.review_list'),
    async (c) => {
    const packageName = c.req.query('package_name') ?? c.env.PACKAGE_NAME;
    const maxResults = Number(c.req.query('max_results') ?? '20');
    const reviews = await listPlayReviews(c.env, packageName, Number.isFinite(maxResults) ? maxResults : 20);
    return c.json({
      ok: true,
      package_name: packageName,
      reviews
    });
    }
  );

  app.post(
    '/admin/play/reviews/:reviewId/reply',
    requireAdminCapability('play-write', 'play.review_reply'),
    async (c) => {
    const reviewId = c.req.param('reviewId');
    const body = (await c.req.json()) as {
      apply?: boolean;
      package_name?: string;
      reply_text?: string;
    };
    if (!body.reply_text?.trim()) {
      return jsonError(400, 'INVALID_REQUEST', 'reply_text is required.');
    }

    const packageName = body.package_name ?? c.env.PACKAGE_NAME;
    const apply = body.apply === true;
    if (!apply) {
      return c.json({
        ok: true,
        dry_run: true,
        review_id: reviewId,
        package_name: packageName,
        reply_text: body.reply_text
      });
    }

    const result = await replyToPlayReview(c.env, packageName, reviewId, body.reply_text);
    return c.json({
      ok: true,
      dry_run: false,
      review_id: reviewId,
      package_name: packageName,
      result
    });
    }
  );
}
