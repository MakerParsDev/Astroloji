import { Hono } from 'hono';

import { generateInviteCode, normalizeFriendPair } from '@/services/friends';
import { enforceStrictRateLimit, mapStrictRateLimitResult } from '@/services/rateLimit';
import type { AppBindings, InviteCodeRow } from '@/types';
import { validateAcceptInviteBody } from '@/utils/validators';

const INVITE_RATE_LIMIT = 10;
const INVITE_RATE_WINDOW_SECONDS = 3600;
const ACCEPT_RATE_LIMIT = 20;
const ACCEPT_RATE_WINDOW_SECONDS = 3600;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const GENERATE_CODE_ATTEMPTS = 5;

function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

async function getInviteCode(db: D1Database, code: string): Promise<InviteCodeRow | null> {
  return (await db.prepare('SELECT * FROM invite_codes WHERE code = ?').bind(code).first()) as InviteCodeRow | null;
}

async function ensureFriendship(db: D1Database, userIdA: string, userIdB: string): Promise<void> {
  const [userA, userB] = normalizeFriendPair(userIdA, userIdB);
  await db
    .prepare(
      `INSERT INTO friendships (id, user_a, user_b, status, created_at)
       VALUES (?, ?, ?, 'active', ?)
       ON CONFLICT(user_a, user_b) DO NOTHING`
    )
    .bind(crypto.randomUUID(), userA, userB, new Date().toISOString())
    .run();
}

export function registerFriendRoutes(app: Hono<AppBindings>): void {
  app.post('/friends/invite', async (c) => {
    const userId = c.get('auth').userId;
    const rateLimitFailure = mapStrictRateLimitResult(
      await enforceStrictRateLimit(c.env, 'friends-invite', userId, INVITE_RATE_LIMIT, INVITE_RATE_WINDOW_SECONDS)
    );
    if (rateLimitFailure) return rateLimitFailure;

    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

    for (let attempt = 0; attempt < GENERATE_CODE_ATTEMPTS; attempt += 1) {
      const code = generateInviteCode();
      try {
        await c.env.DB
          .prepare(
            `INSERT INTO invite_codes (code, owner_user_id, created_at, expires_at, redeemed_by, redeemed_at)
             VALUES (?, ?, ?, ?, NULL, NULL)`
          )
          .bind(code, userId, createdAt, expiresAt)
          .run();
        return c.json({ code, expires_at: expiresAt }, 201);
      } catch {
        // Unique constraint collision on the code itself (astronomically rare) — retry with a fresh code.
      }
    }
    return jsonError(503, 'INVITE_CODE_GENERATION_FAILED', 'Could not generate a unique invite code.');
  });

  app.post('/friends/accept', async (c) => {
    const userId = c.get('auth').userId;
    const rateLimitFailure = mapStrictRateLimitResult(
      await enforceStrictRateLimit(c.env, 'friends-accept', userId, ACCEPT_RATE_LIMIT, ACCEPT_RATE_WINDOW_SECONDS)
    );
    if (rateLimitFailure) return rateLimitFailure;

    const body = validateAcceptInviteBody(await c.req.json());
    const invite = await getInviteCode(c.env.DB, body.code);
    if (!invite) {
      return jsonError(404, 'INVITE_NOT_FOUND', 'Invite code was not found.');
    }
    if (invite.expires_at <= new Date().toISOString()) {
      return jsonError(410, 'INVITE_EXPIRED', 'Invite code has expired.');
    }
    if (invite.owner_user_id === userId) {
      return jsonError(400, 'CANNOT_ACCEPT_OWN_INVITE', 'You cannot accept your own invite code.');
    }
    if (invite.redeemed_by) {
      if (invite.redeemed_by !== userId) {
        return jsonError(409, 'INVITE_ALREADY_REDEEMED', 'Invite code was already redeemed.');
      }
      await ensureFriendship(c.env.DB, invite.owner_user_id, userId);
      return c.json({ ok: true, duplicate: true, friend_user_id: invite.owner_user_id });
    }

    const redeemedAt = new Date().toISOString();
    const result = await c.env.DB
      .prepare(
        `UPDATE invite_codes SET redeemed_by = ?, redeemed_at = ?
         WHERE code = ? AND redeemed_by IS NULL AND expires_at > ?`
      )
      .bind(userId, redeemedAt, body.code, redeemedAt)
      .run();

    if ((result.meta.changes ?? 0) !== 1) {
      const current = await getInviteCode(c.env.DB, body.code);
      if (current?.redeemed_by === userId) {
        await ensureFriendship(c.env.DB, invite.owner_user_id, userId);
        return c.json({ ok: true, duplicate: true, friend_user_id: invite.owner_user_id });
      }
      return jsonError(409, 'INVITE_ALREADY_REDEEMED', 'Invite code was already redeemed.');
    }

    await ensureFriendship(c.env.DB, invite.owner_user_id, userId);
    return c.json({ ok: true, duplicate: false, friend_user_id: invite.owner_user_id });
  });

  app.get('/friends', async (c) => {
    const userId = c.get('auth').userId;
    const rows = (await c.env.DB
      .prepare(
        `SELECT u.id AS user_id, u.sign AS sign, u.language AS language
         FROM friendships f
         JOIN users u ON u.id = (CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END)
         WHERE (f.user_a = ? OR f.user_b = ?) AND f.status = 'active'
         ORDER BY u.id`
      )
      .bind(userId, userId, userId)
      .all()).results as Array<{ user_id: string; sign: string; language: string }>;

    return c.json({ friends: rows });
  });

  app.delete('/friends/:friendUserId', async (c) => {
    const userId = c.get('auth').userId;
    const friendUserId = c.req.param('friendUserId');
    const [userA, userB] = normalizeFriendPair(userId, friendUserId);
    await c.env.DB.prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').bind(userA, userB).run();
    return c.json({ ok: true });
  });
}
