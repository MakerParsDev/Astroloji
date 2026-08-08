import type { Next } from 'hono';

import { logAdminOperation } from '@/services/adminAudit';
import { verifyPlayRtdnIdentity } from '@/services/playRtdnAuth';
import type { AdminCapability, AdminOperation, AppContext, AppMiddleware, Env } from '@/types';
import { verifyAppJwt } from '@/utils/jwt';
import { matchesSecret } from '@/utils/security';
import { parseBooleanFlag } from '@/utils/validators';

function jsonError(c: AppContext, status: number, code: string, message: string) {
  return c.json({ error: { code, message } }, { status: status as 401 | 403 });
}

async function userExists(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS ok FROM users WHERE id = ? LIMIT 1')
    .bind(userId)
    .first<{ ok: number }>();
  return row?.ok === 1;
}

export function getBearerToken(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  const [scheme, token] = value.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

export const jwtAuthMiddleware: AppMiddleware = async (c, next: Next) => {
  const token = getBearerToken(c.req.header('authorization'));
  if (!token) {
    return jsonError(c, 401, 'UNAUTHORIZED', 'Missing authorization header.');
  }

  try {
    const claims = await verifyAppJwt(c.env, token);
    if (!(await userExists(c.env.DB, claims.user_id))) {
      return jsonError(c, 401, 'INVALID_TOKEN', 'Authorization token is invalid or expired.');
    }
    c.set('auth', {
      userId: claims.user_id,
      isPremium: claims.is_premium,
      firebaseUid: claims.firebase_uid,
      exp: claims.exp
    });
    await next();
  } catch {
    return jsonError(c, 401, 'INVALID_TOKEN', 'Authorization token is invalid or expired.');
  }
};

const ADMIN_SECRET_BINDINGS = {
  'content-ops': 'ADMIN_CONTENT_SECRET',
  'notification-ops': 'ADMIN_NOTIFICATION_SECRET',
  'play-read': 'ADMIN_PLAY_READ_SECRET',
  'play-write': 'ADMIN_PLAY_WRITE_SECRET'
} as const satisfies Record<AdminCapability, keyof Env>;

function matchesAdminCapability(c: AppContext, capability: AdminCapability): boolean {
  const provided = c.req.header('x-admin-secret');
  const scoped = c.env[ADMIN_SECRET_BINDINGS[capability]];
  return matchesSecret(scoped, provided) || matchesSecret(c.env.ADMIN_SECRET, provided);
}

async function runAdminCapability(
  c: AppContext,
  next: Next,
  capability: AdminCapability,
  operation: AdminOperation,
  beforeNext?: () => void
): Promise<Response | void> {
  const audit = (outcome: 'authorized' | 'rejected' | 'completed' | 'failed') =>
    logAdminOperation({ requestId: c.get('requestId'), capability, operation, outcome });

  if (!matchesAdminCapability(c, capability)) {
    audit('rejected');
    return jsonError(c, 403, 'FORBIDDEN', 'Admin secret is invalid.');
  }

  audit('authorized');
  beforeNext?.();
  try {
    await next();
    audit(c.res.status < 400 ? 'completed' : 'failed');
  } catch (error) {
    audit('failed');
    throw error;
  }
}

export function requireAdminCapability(
  capability: AdminCapability,
  operation: AdminOperation
): AppMiddleware {
  return (c, next) => runAdminCapability(c, next, capability, operation);
}

export const adminSecretMiddleware: AppMiddleware = async (c, next: Next) => {
  const adminSecret = c.req.header('x-admin-secret');
  if (!matchesSecret(c.env.ADMIN_SECRET, adminSecret)) {
    return jsonError(c, 403, 'FORBIDDEN', 'Admin secret is invalid.');
  }

  await next();
};

export const contentCacheBypassMiddleware: AppMiddleware = async (c, next: Next) => {
  const wantsBypass = parseBooleanFlag(c.req.header('x-cache-bypass'));
  c.set('bypassCache', false);
  if (!wantsBypass) {
    await next();
    return;
  }

  return runAdminCapability(c, next, 'content-ops', 'content.cache_bypass', () => {
    c.set('bypassCache', true);
  });
};

type PlayWebhookIdentityVerifier = (env: Env, token: string) => Promise<void>;

export async function requirePlayWebhookAuth(
  c: AppContext,
  verifyIdentity: PlayWebhookIdentityVerifier = verifyPlayRtdnIdentity
): Promise<{ method: 'oidc' } | Response> {
  const bearer = getBearerToken(c.req.header('authorization'));
  if (!bearer) {
    return jsonError(c, 403, 'FORBIDDEN', 'Play webhook identity is invalid.');
  }
  try {
    await verifyIdentity(c.env, bearer);
    return { method: 'oidc' };
  } catch {
    return jsonError(c, 403, 'FORBIDDEN', 'Play webhook identity is invalid.');
  }
}
