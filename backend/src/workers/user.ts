import { Hono } from 'hono';

import { enforceStrictRateLimit, mapStrictRateLimitResult } from '@/services/rateLimit';
import { deleteFirebaseUser, isFirebaseAccountDeletionError } from '@/services/firebaseAuth';
import type {
  AppBindings,
  FcmTokenRow,
  NotificationTargetType,
  Platform,
  RegisterRequest,
  UpdateUserRequest,
  UserProfileResponse,
  UserRow
} from '@/types';
import { signAppJwt, verifyFirebaseIdToken } from '@/utils/jwt';
import {
  validateRegisterBody,
  validateUpdateUserBody
} from '@/utils/validators';

function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

async function getUserByFirebaseUid(db: D1Database, firebaseUid: string): Promise<UserRow | null> {
  return (await db
    .prepare('SELECT * FROM users WHERE firebase_uid = ?')
    .bind(firebaseUid)
    .first()) as UserRow | null;
}

async function getUserById(db: D1Database, userId: string): Promise<UserRow | null> {
  return (await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first()) as UserRow | null;
}

async function getUserToken(db: D1Database, userId: string): Promise<FcmTokenRow | null> {
  return (await db
    .prepare('SELECT * FROM fcm_tokens WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1')
    .bind(userId)
    .first()) as FcmTokenRow | null;
}

function resolveNotificationTarget(
  body: Pick<RegisterRequest | UpdateUserRequest, 'fcm_token' | 'firebase_installation_id'>
): { value: string; type: NotificationTargetType } | null {
  if (body.firebase_installation_id) {
    return { value: body.firebase_installation_id, type: 'fid' };
  }
  if (body.fcm_token) {
    return { value: body.fcm_token, type: 'token' };
  }
  return null;
}

async function upsertNotificationTarget(
  db: D1Database,
  args: {
    userId: string;
    value: string;
    targetType: NotificationTargetType;
    notificationEnabled?: boolean;
    notificationHour: number;
    platform: Platform;
  }
) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `DELETE FROM fcm_tokens
       WHERE user_id = ? AND platform = ? AND target_type <> ?`
    )
    .bind(args.userId, args.platform, args.targetType)
    .run();

  const existing = (await db
    .prepare('SELECT id FROM fcm_tokens WHERE token = ? AND target_type = ?')
    .bind(args.value, args.targetType)
    .first()) as { id: string } | null;

  if (existing) {
    await db
      .prepare(
        `UPDATE fcm_tokens
         SET user_id = ?, platform = ?, notification_enabled = COALESCE(?, notification_enabled), notification_hour = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(
        args.userId,
        args.platform,
        typeof args.notificationEnabled === 'boolean' ? Number(args.notificationEnabled) : null,
        args.notificationHour,
        now,
        existing.id
      )
      .run();
    return;
  }

  await db
    .prepare(
      `INSERT INTO fcm_tokens (id, user_id, token, target_type, platform, notification_enabled, notification_hour, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      args.userId,
      args.value,
      args.targetType,
      args.platform,
      typeof args.notificationEnabled === 'boolean' ? Number(args.notificationEnabled) : 1,
      args.notificationHour,
      now,
      now
    )
    .run();
}

async function deleteKvKeysByPrefix(cache: KVNamespace, prefix: string): Promise<void> {
  let cursor: string | undefined;

  do {
    const page = await cache.list({
      prefix,
      ...(cursor ? { cursor } : {})
    });
    await Promise.all(page.keys.map((key) => cache.delete(key.name)));

    if (page.list_complete) {
      return;
    }
    cursor = page.cursor;
  } while (cursor);
}

async function deleteR2KeysByPrefix(bucket: R2Bucket, prefix: string): Promise<void> {
  let cursor: string | undefined;

  do {
    const page = await bucket.list({
      prefix,
      ...(cursor ? { cursor } : {})
    });
    await Promise.all(page.objects.map((object) => bucket.delete(object.key)));

    if (!page.truncated) {
      return;
    }
    cursor = page.cursor;
  } while (cursor);
}

async function deleteUserData(env: AppBindings['Bindings'], userId: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM subscription_events WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_events WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM reward_challenges WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM fcm_tokens WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM subscriptions WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_birth_data WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM credit_ledger WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM mood_logs WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM friendships WHERE user_a = ? OR user_b = ?').bind(userId, userId),
    env.DB.prepare('DELETE FROM invite_codes WHERE owner_user_id = ?').bind(userId),
    env.DB
      .prepare('UPDATE invite_codes SET redeemed_by = NULL, redeemed_at = NULL WHERE redeemed_by = ?')
      .bind(userId),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId)
  ]);
}

function toUserProfile(user: UserRow, token: FcmTokenRow | null): UserProfileResponse {
  return {
    user_id: user.id,
    sign: user.sign,
    language: user.language,
    utc_offset: user.utc_offset,
    is_premium: Boolean(user.is_premium),
    subscription_state: user.subscription_state ?? 'none',
    premium_expires_at: user.premium_expires_at,
    notification_enabled: Boolean(token?.notification_enabled ?? 1),
    notification_hour: token?.notification_hour ?? 9
  };
}

export function registerUserRoutes(app: Hono<AppBindings>) {
  app.post('/users/register', async (c) => {
    const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
    const rateLimitFailure = mapStrictRateLimitResult(
      await enforceStrictRateLimit(c.env, 'register', ip, 10, 60)
    );
    if (rateLimitFailure) return rateLimitFailure;

    const authHeader = c.req.header('authorization');
    if (!authHeader) {
      return jsonError(401, 'UNAUTHORIZED', 'Missing authorization header.');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return jsonError(401, 'UNAUTHORIZED', 'Missing authorization header.');
    }

    const body = validateRegisterBody(await c.req.json());
    const firebaseClaims = await verifyFirebaseIdToken(c.env, token);
    const firebaseUid = firebaseClaims.sub;
    const now = new Date().toISOString();

    let user = await getUserByFirebaseUid(c.env.DB, firebaseUid);
    if (user) {
      await c.env.DB
        .prepare(
        `UPDATE users
           SET sign = ?, language = ?, utc_offset = ?, last_seen_at = ?
           WHERE id = ?`
        )
        .bind(body.sign, body.language, body.utc_offset, now, user.id)
        .run();
    } else {
      const userId = crypto.randomUUID();
      await c.env.DB
        .prepare(
          `INSERT INTO users (id, firebase_uid, sign, language, utc_offset, is_premium, subscription_state, premium_expires_at, created_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, 0, 'none', NULL, ?, ?)`
        )
        .bind(userId, firebaseUid, body.sign, body.language, body.utc_offset, now, now)
        .run();
      user = await getUserById(c.env.DB, userId);
    }

    if (!user) {
      return jsonError(500, 'USER_SYNC_FAILED', 'Unable to create or load user.');
    }

    const registrationTarget = resolveNotificationTarget(body);
    if (registrationTarget) {
      await upsertNotificationTarget(c.env.DB, {
        userId: user.id,
        value: registrationTarget.value,
        targetType: registrationTarget.type,
        notificationHour: body.notification_hour ?? 9,
        platform: body.platform
      });
    }

    const refreshedUser = await getUserById(c.env.DB, user.id);
    if (!refreshedUser) {
      return jsonError(500, 'USER_SYNC_FAILED', 'Unable to load user after register.');
    }

    const jwt = await signAppJwt(c.env, {
      userId: refreshedUser.id,
      isPremium: Boolean(refreshedUser.is_premium),
      firebaseUid
    });

    return c.json({
      user_id: refreshedUser.id,
      jwt,
      is_premium: Boolean(refreshedUser.is_premium),
      subscription_state: refreshedUser.subscription_state ?? 'none',
      premium_expires_at: refreshedUser.premium_expires_at
    });
  });

  app.get('/users/me', async (c) => {
    const user = await getUserById(c.env.DB, c.get('auth').userId);
    if (!user) {
      return jsonError(404, 'USER_NOT_FOUND', 'User was not found.');
    }

    const token = await getUserToken(c.env.DB, user.id);
    return c.json(toUserProfile(user, token));
  });

  app.post('/users/refresh-token', async (c) => {
    const auth = c.get('auth');
    const user = await getUserById(c.env.DB, auth.userId);
    if (!user) {
      return jsonError(404, 'USER_NOT_FOUND', 'User not found.');
    }

    const jwt = await signAppJwt(c.env, {
      userId: user.id,
      isPremium: Boolean(user.is_premium),
      firebaseUid: auth.firebaseUid ?? user.firebase_uid ?? undefined
    });

    return c.json({
      jwt,
      is_premium: Boolean(user.is_premium),
      subscription_state: user.subscription_state ?? 'none'
    });
  });

  app.put('/users/me', async (c) => {
    const body = validateUpdateUserBody(await c.req.json());
    const user = await getUserById(c.env.DB, c.get('auth').userId);
    if (!user) {
      return jsonError(404, 'USER_NOT_FOUND', 'User was not found.');
    }

    const now = new Date().toISOString();
    await c.env.DB
      .prepare('UPDATE users SET sign = ?, language = ?, utc_offset = ?, last_seen_at = ? WHERE id = ?')
      .bind(
        body.sign ?? user.sign,
        body.language ?? user.language,
        body.utc_offset ?? user.utc_offset,
        now,
        user.id
      )
      .run();

    const updateTarget = resolveNotificationTarget(body);
    if (updateTarget) {
      await upsertNotificationTarget(c.env.DB, {
        userId: user.id,
        value: updateTarget.value,
        targetType: updateTarget.type,
        notificationEnabled: body.notification_enabled,
        notificationHour: body.notification_hour ?? 9,
        platform: body.platform ?? 'android'
      });
    } else if (
      typeof body.notification_enabled === 'boolean' ||
      typeof body.notification_hour === 'number' ||
      body.platform
    ) {
      await c.env.DB
        .prepare(
          `UPDATE fcm_tokens
           SET notification_enabled = COALESCE(?, notification_enabled),
               platform = COALESCE(?, platform),
               notification_hour = COALESCE(?, notification_hour),
               updated_at = ?
           WHERE user_id = ?`
        )
        .bind(
          typeof body.notification_enabled === 'boolean' ? Number(body.notification_enabled) : null,
          body.platform ?? null,
          body.notification_hour ?? null,
          now,
          user.id
        )
        .run();
    }

    const refreshedUser = await getUserById(c.env.DB, user.id);
    const refreshedToken = await getUserToken(c.env.DB, user.id);
    return c.json(toUserProfile(refreshedUser as UserRow, refreshedToken));
  });

  app.delete('/users/me', async (c) => {
    const auth = c.get('auth');
    if (!auth.firebaseUid) {
      return jsonError(
        409,
        'FIREBASE_IDENTITY_MISSING',
        'Firebase identity is required to delete the account.'
      );
    }

    try {
      await deleteUserData(c.env, auth.userId);
      await deleteFirebaseUser(c.env, auth.firebaseUid);
    } catch (error) {
      if (isFirebaseAccountDeletionError(error)) {
        return jsonError(
          502,
          'FIREBASE_DELETION_FAILED',
          'Firebase account deletion failed. Retry the request.'
        );
      }
      return jsonError(
        500,
        'ACCOUNT_DELETION_FAILED',
        'Account data could not be deleted. Retry the request.'
      );
    }

    try {
      await deleteKvKeysByPrefix(c.env.CACHE, `reward:${auth.userId}:`);
    } catch (error) {
      console.error('Reward cache cleanup failed during account deletion.', error);
    }

    try {
      await deleteR2KeysByPrefix(c.env.CONTENT, `deep-reading/${auth.userId}/`);
    } catch (error) {
      console.error('Deep reading cleanup failed during account deletion.', error);
    }

    return c.json({
      ok: true,
      user_id: auth.userId,
      firebase_account_deleted: true
    });
  });
}
