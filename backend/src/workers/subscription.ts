import { Hono } from 'hono';

import { enforceRateLimit } from '@/services/cache';
import {
  getSubscriptionStatus,
  hasPremiumEntitlement,
  listPlayReviews,
  listPlaySubscriptions,
  patchPlaySubscription,
  replyToPlayReview,
  verifySubscriptionPurchase
} from '@/services/playBilling';
import { requirePlayWebhookSecret } from '@/middleware/auth';
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

export function registerSubscriptionRoutes(app: Hono<AppBindings>) {
  app.post('/subscriptions/verify', async (c) => {
    const userId = c.get('auth').userId;
    const allowed = await enforceRateLimit(c.env, `verify:${userId}`, 5, 60);
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
    const invalidSecretResponse = requirePlayWebhookSecret(c);
    if (invalidSecretResponse) {
      return invalidSecretResponse;
    }

    const payload = decodeWebhookPayload(await c.req.json());
    const notification = extractSubscriptionNotification(payload);
    const purchaseToken = notification.purchaseToken;
    const productId = notification.productId;
    const eventType =
      notification.notificationType === undefined
        ? null
        : mapPlayEventType(notification.notificationType);

    if (!purchaseToken || !productId || !eventType) {
      return jsonError(400, 'INVALID_WEBHOOK', 'Webhook payload is missing subscription details.');
    }

    const userId = await findUserByPurchaseToken(c.env.DB, purchaseToken);
    const liveSubscription = await getSubscriptionStatus(
      c.env,
      purchaseToken,
      productId,
      c.env.PACKAGE_NAME
    );

    if (!userId && !liveSubscription) {
      return c.json({ ok: true });
    }

    if (!userId) {
      return jsonError(404, 'USER_NOT_FOUND', 'User for webhook purchase token was not found.');
    }

    if (!liveSubscription) {
      await writeSubscriptionEvent(
        c.env.DB,
        userId,
        purchaseToken,
        'sync_pending',
        buildPendingReconciliationPayload(eventType, payload)
      );
      return c.json({ ok: true, reconciliation: 'pending' });
    }

    await processSubscription(c.env.DB, userId, liveSubscription, eventType, payload);
    return c.json({ ok: true });
  });
}

export function registerSubscriptionAdminRoutes(app: Hono<AppBindings>) {
  app.get('/admin/play/subscriptions', async (c) => {
    const packageName = c.req.query('package_name') ?? c.env.PACKAGE_NAME;
    const subscriptions = await listPlaySubscriptions(c.env, packageName);
    return c.json({
      ok: true,
      package_name: packageName,
      subscriptions
    });
  });

  app.patch('/admin/play/subscriptions/:productId', async (c) => {
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
  });

  app.get('/admin/subscriptions/audit', async (c) => {
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
          'premium_yearly',
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
  });

  app.get('/admin/play/reviews', async (c) => {
    const packageName = c.req.query('package_name') ?? c.env.PACKAGE_NAME;
    const maxResults = Number(c.req.query('max_results') ?? '20');
    const reviews = await listPlayReviews(c.env, packageName, Number.isFinite(maxResults) ? maxResults : 20);
    return c.json({
      ok: true,
      package_name: packageName,
      reviews
    });
  });

  app.post('/admin/play/reviews/:reviewId/reply', async (c) => {
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
  });
}
