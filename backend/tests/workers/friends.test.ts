import { describe, expect, it } from 'vitest';

import { createApp } from '@/index';
import { signAppJwt } from '@/utils/jwt';
import { createTestEnv } from '../helpers/env';

interface InviteCodeRow {
  code: string;
  owner_user_id: string;
  created_at: string;
  expires_at: string;
  redeemed_by: string | null;
  redeemed_at: string | null;
}

interface FriendshipRow {
  id: string;
  user_a: string;
  user_b: string;
}

interface UserRow {
  id: string;
  sign: string;
  language: string;
}

interface FriendsDbSeed {
  users?: UserRow[];
  invites?: InviteCodeRow[];
  friendships?: FriendshipRow[];
}

function createFriendsDb(seed: FriendsDbSeed = {}) {
  const users = seed.users ?? [];
  const invites = [...(seed.invites ?? [])];
  const friendships = [...(seed.friendships ?? [])];

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
            const userId = statement.bindings[0] as string;
            return users.some((user) => user.id === userId) ? { ok: 1 } : null;
          }
          if (normalized.startsWith('SELECT * FROM invite_codes WHERE code')) {
            const code = statement.bindings[0] as string;
            return invites.find((invite) => invite.code === code) ?? null;
          }
          return null;
        },
        async all() {
          if (normalized.startsWith('SELECT u.id AS user_id')) {
            const userId = statement.bindings[0] as string;
            const friendIds = friendships
              .filter((f) => f.user_a === userId || f.user_b === userId)
              .map((f) => (f.user_a === userId ? f.user_b : f.user_a));
            const results = friendIds
              .map((id) => users.find((u) => u.id === id))
              .filter((u): u is UserRow => Boolean(u))
              .map((u) => ({ user_id: u.id, sign: u.sign, language: u.language }));
            return { results };
          }
          return { results: [] };
        },
        async run() {
          if (normalized.startsWith('INSERT INTO invite_codes')) {
            const [code, ownerUserId, createdAt, expiresAt] = statement.bindings as [string, string, string, string];
            if (invites.some((invite) => invite.code === code)) {
              throw new Error('UNIQUE constraint failed: invite_codes.code');
            }
            invites.push({ code, owner_user_id: ownerUserId, created_at: createdAt, expires_at: expiresAt, redeemed_by: null, redeemed_at: null });
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith('UPDATE invite_codes SET redeemed_by = ?, redeemed_at = ?')) {
            const [redeemedBy, redeemedAt, code, nowIso] = statement.bindings as [string, string, string, string];
            const invite = invites.find((candidate) => candidate.code === code);
            if (!invite || invite.redeemed_by !== null || invite.expires_at <= nowIso) {
              return { success: true, meta: { changes: 0 } };
            }
            invite.redeemed_by = redeemedBy;
            invite.redeemed_at = redeemedAt;
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith('INSERT INTO friendships')) {
            const [id, userA, userB, createdAt] = statement.bindings as [string, string, string, string];
            if (friendships.some((f) => f.user_a === userA && f.user_b === userB)) {
              return { success: true, meta: { changes: 0 } };
            }
            friendships.push({ id, user_a: userA, user_b: userB });
            void createdAt;
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith('DELETE FROM friendships')) {
            const [userA, userB] = statement.bindings as [string, string];
            const before = friendships.length;
            const remaining = friendships.filter((f) => !(f.user_a === userA && f.user_b === userB));
            friendships.length = 0;
            friendships.push(...remaining);
            return { success: true, meta: { changes: before - friendships.length } };
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

  return { db, invites, friendships };
}

const FUTURE_ISO = '2099-01-01T00:00:00.000Z';

describe('friends worker', () => {
  it('generates an invite code for the authenticated user', async () => {
    const { db, invites } = createFriendsDb({ users: [{ id: 'user-1', sign: 'aries', language: 'en' }] });
    const env = createTestEnv({ DB: db });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });

    const response = await createApp().request(
      '/api/v1/friends/invite',
      { method: 'POST', headers: { authorization: `Bearer ${jwt}` } },
      env
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { code: string; expires_at: string };
    expect(body.code).toHaveLength(8);
    expect(invites).toHaveLength(1);
    expect(invites[0].owner_user_id).toBe('user-1');
  });

  it('accepts a valid invite and creates a bidirectional friendship', async () => {
    const { db, friendships } = createFriendsDb({
      users: [
        { id: 'user-1', sign: 'aries', language: 'en' },
        { id: 'user-2', sign: 'leo', language: 'tr' }
      ],
      invites: [
        { code: 'ABCDEFGH', owner_user_id: 'user-1', created_at: '2026-01-01T00:00:00.000Z', expires_at: FUTURE_ISO, redeemed_by: null, redeemed_at: null }
      ]
    });
    const env = createTestEnv({ DB: db });
    const jwt = await signAppJwt(env, { userId: 'user-2', isPremium: false });

    const response = await createApp().request(
      '/api/v1/friends/accept',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'ABCDEFGH' })
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, duplicate: false, friend_user_id: 'user-1' });
    expect(friendships).toEqual([{ id: expect.any(String), user_a: 'user-1', user_b: 'user-2' }]);
  });

  it('rejects an invite a user tries to redeem twice with a duplicate response, not a new friendship', async () => {
    const { db, friendships } = createFriendsDb({
      users: [
        { id: 'user-1', sign: 'aries', language: 'en' },
        { id: 'user-2', sign: 'leo', language: 'tr' }
      ],
      invites: [
        {
          code: 'ABCDEFGH',
          owner_user_id: 'user-1',
          created_at: '2026-01-01T00:00:00.000Z',
          expires_at: FUTURE_ISO,
          redeemed_by: 'user-2',
          redeemed_at: '2026-01-02T00:00:00.000Z'
        }
      ],
      friendships: [{ id: 'f1', user_a: 'user-1', user_b: 'user-2' }]
    });
    const env = createTestEnv({ DB: db });
    const jwt = await signAppJwt(env, { userId: 'user-2', isPremium: false });

    const response = await createApp().request(
      '/api/v1/friends/accept',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'ABCDEFGH' })
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, duplicate: true, friend_user_id: 'user-1' });
    expect(friendships).toHaveLength(1);
  });

  it('rejects a code already redeemed by someone else', async () => {
    const { db } = createFriendsDb({
      users: [
        { id: 'user-1', sign: 'aries', language: 'en' },
        { id: 'user-2', sign: 'leo', language: 'tr' },
        { id: 'user-3', sign: 'libra', language: 'en' }
      ],
      invites: [
        {
          code: 'ABCDEFGH',
          owner_user_id: 'user-1',
          created_at: '2026-01-01T00:00:00.000Z',
          expires_at: FUTURE_ISO,
          redeemed_by: 'user-2',
          redeemed_at: '2026-01-02T00:00:00.000Z'
        }
      ]
    });
    const env = createTestEnv({ DB: db });
    const jwt = await signAppJwt(env, { userId: 'user-3', isPremium: false });

    const response = await createApp().request(
      '/api/v1/friends/accept',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'ABCDEFGH' })
      },
      env
    );

    expect(response.status).toBe(409);
  });

  it('rejects accepting your own invite code', async () => {
    const { db } = createFriendsDb({
      users: [{ id: 'user-1', sign: 'aries', language: 'en' }],
      invites: [
        { code: 'ABCDEFGH', owner_user_id: 'user-1', created_at: '2026-01-01T00:00:00.000Z', expires_at: FUTURE_ISO, redeemed_by: null, redeemed_at: null }
      ]
    });
    const env = createTestEnv({ DB: db });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });

    const response = await createApp().request(
      '/api/v1/friends/accept',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'ABCDEFGH' })
      },
      env
    );

    expect(response.status).toBe(400);
  });

  it('rejects an expired invite code', async () => {
    const { db } = createFriendsDb({
      users: [
        { id: 'user-1', sign: 'aries', language: 'en' },
        { id: 'user-2', sign: 'leo', language: 'tr' }
      ],
      invites: [
        {
          code: 'ABCDEFGH',
          owner_user_id: 'user-1',
          created_at: '2020-01-01T00:00:00.000Z',
          expires_at: '2020-01-08T00:00:00.000Z',
          redeemed_by: null,
          redeemed_at: null
        }
      ]
    });
    const env = createTestEnv({ DB: db });
    const jwt = await signAppJwt(env, { userId: 'user-2', isPremium: false });

    const response = await createApp().request(
      '/api/v1/friends/accept',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'ABCDEFGH' })
      },
      env
    );

    expect(response.status).toBe(410);
  });

  it('lists friends with only derived fields, never raw birth data', async () => {
    const { db } = createFriendsDb({
      users: [
        { id: 'user-1', sign: 'aries', language: 'en' },
        { id: 'user-2', sign: 'leo', language: 'tr' }
      ],
      friendships: [{ id: 'f1', user_a: 'user-1', user_b: 'user-2' }]
    });
    const env = createTestEnv({ DB: db });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });

    const response = await createApp().request('/api/v1/friends', { headers: { authorization: `Bearer ${jwt}` } }, env);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { friends: Array<Record<string, unknown>> };
    expect(body.friends).toEqual([{ user_id: 'user-2', sign: 'leo', language: 'tr' }]);
    expect(Object.keys(body.friends[0])).not.toContain('encrypted_payload');
  });

  it('removes a friendship symmetrically regardless of argument order', async () => {
    const { db, friendships } = createFriendsDb({
      users: [
        { id: 'user-1', sign: 'aries', language: 'en' },
        { id: 'user-2', sign: 'leo', language: 'tr' }
      ],
      friendships: [{ id: 'f1', user_a: 'user-1', user_b: 'user-2' }]
    });
    const env = createTestEnv({ DB: db });
    const jwt = await signAppJwt(env, { userId: 'user-2', isPremium: false });

    const response = await createApp().request(
      '/api/v1/friends/user-1',
      { method: 'DELETE', headers: { authorization: `Bearer ${jwt}` } },
      env
    );

    expect(response.status).toBe(200);
    expect(friendships).toHaveLength(0);
  });
});
