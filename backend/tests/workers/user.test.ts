import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteFirebaseUserMock, verifyFirebaseIdTokenMock } = vi.hoisted(() => ({
  deleteFirebaseUserMock: vi.fn(),
  verifyFirebaseIdTokenMock: vi.fn()
}));

vi.mock('@/services/firebaseAuth', async () => {
  const actual = await vi.importActual<typeof import('@/services/firebaseAuth')>(
    '@/services/firebaseAuth'
  );
  return {
    ...actual,
    deleteFirebaseUser: deleteFirebaseUserMock
  };
});

vi.mock('@/utils/jwt', async () => {
  const actual = await vi.importActual<typeof import('@/utils/jwt')>('@/utils/jwt');
  return {
    ...actual,
    verifyFirebaseIdToken: verifyFirebaseIdTokenMock
  };
});

import { createApp } from '@/index';
import { FirebaseAccountDeletionError } from '@/services/firebaseAuth';
import { signAppJwt, verifyAppJwt } from '@/utils/jwt';
import { createRateLimiterNamespace, createTestEnv } from '../helpers/env';

function createDeletionDb() {
  const batched: Array<{ sql: string; bindings: unknown[] }> = [];

  const db = {
    prepare(sql: string) {
      const statement = {
        sql,
        bindings: [] as unknown[],
        bind(...bindings: unknown[]) {
          statement.bindings = bindings;
          return statement;
        },
        async first() {
          return sql.includes('SELECT 1 AS ok FROM users') ? { ok: 1 } : null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          return { success: true, meta: {} };
        }
      };
      return statement;
    },
    async batch(statements: Array<{ sql: string; bindings: unknown[] }>) {
      batched.push(...statements.map((statement) => ({
        sql: statement.sql,
        bindings: statement.bindings
      })));
      return statements.map(() => ({ success: true, meta: {} }));
    }
  } as unknown as D1Database;

  return { db, batched };
}

describe('user routes', () => {
  it.each([
    ['denied', async () => ({ allowed: false, remaining: 0, retryAfterSeconds: 9 }), 429, 'RATE_LIMITED'],
    ['unavailable', async () => { throw new Error('rate limiter unavailable'); }, 503, 'RATE_LIMIT_UNAVAILABLE']
  ])('fails closed before registration auth or mutation when strict limiter is %s', async (_name, check, status, code) => {
    const limiterCheck = vi.fn(check);
    const env = createTestEnv({ RATE_LIMITER: createRateLimiterNamespace(limiterCheck) });
    const response = await createApp().request(
      '/api/v1/users/register',
      {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.9', 'content-type': 'application/json' },
        body: JSON.stringify({ sign: 'aries', language: 'tr', utc_offset: 3, platform: 'android' })
      },
      env
    );
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
    expect(limiterCheck).toHaveBeenCalledTimes(1);
    expect(verifyFirebaseIdTokenMock).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    deleteFirebaseUserMock.mockReset();
    deleteFirebaseUserMock.mockResolvedValue(undefined);
    verifyFirebaseIdTokenMock.mockReset();
    verifyFirebaseIdTokenMock.mockResolvedValue({
      aud: 'demo-project',
      iss: 'https://securetoken.google.com/demo-project',
      sub: 'firebase-1'
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });


  it('registers a user without creating an FCM token row when no token is available', async () => {
    const user = {
      id: 'user-1',
      firebase_uid: 'firebase-1',
      sign: 'aries',
      language: 'tr',
      utc_offset: 3,
      is_premium: 0,
      subscription_state: 'none',
      premium_expires_at: null,
      created_at: '2026-07-26T00:00:00.000Z',
      last_seen_at: '2026-07-26T00:00:00.000Z'
    };
    const executedSql: string[] = [];
    const env = createTestEnv({
      DB: {
        prepare(sql: string) {
          const statement = {
            bindings: [] as unknown[],
            bind(...bindings: unknown[]) {
              statement.bindings = bindings;
              return statement;
            },
            async first() {
              if (sql.includes('SELECT * FROM users WHERE firebase_uid = ?')) {
                return user;
              }
              if (sql.includes('SELECT * FROM users WHERE id = ?')) {
                return user;
              }
              return null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              executedSql.push(sql.replace(/\s+/g, ' ').trim());
              return { success: true, meta: {} };
            }
          };
          return statement;
        },
        async batch() {
          return [];
        }
      } as unknown as D1Database
    });

    const response = await createApp().request(
      '/api/v1/users/register',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer firebase-id-token',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sign: 'aries',
          language: 'tr',
          notification_hour: 9,
          utc_offset: 3,
          platform: 'android'
        })
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      user_id: 'user-1',
      is_premium: false,
      subscription_state: 'none'
    });
    expect(executedSql.some((sql) => sql.includes('fcm_tokens'))).toBe(false);
  });

  it('registers a Firebase installation ID and replaces the legacy target for the same platform', async () => {
    const user = {
      id: 'user-1',
      firebase_uid: 'firebase-1',
      sign: 'aries',
      language: 'tr',
      utc_offset: 3,
      is_premium: 0,
      subscription_state: 'none',
      premium_expires_at: null,
      created_at: '2026-07-26T00:00:00.000Z',
      last_seen_at: '2026-07-26T00:00:00.000Z'
    };
    const executed: Array<{ sql: string; bindings: unknown[] }> = [];
    const env = createTestEnv({
      DB: {
        prepare(sql: string) {
          const statement = {
            bindings: [] as unknown[],
            bind(...bindings: unknown[]) {
              statement.bindings = bindings;
              return statement;
            },
            async first() {
              if (sql.includes('SELECT * FROM users WHERE firebase_uid = ?')) return user;
              if (sql.includes('SELECT * FROM users WHERE id = ?')) return user;
              return null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              executed.push({ sql: sql.replace(/\s+/g, ' ').trim(), bindings: statement.bindings });
              return { success: true, meta: {} };
            }
          };
          return statement;
        },
        async batch() {
          return [];
        }
      } as unknown as D1Database
    });

    const response = await createApp().request(
      '/api/v1/users/register',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer [REDACTED]',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sign: 'aries',
          language: 'tr',
          firebase_installation_id: 'fid-123',
          notification_hour: 9,
          utc_offset: 3,
          platform: 'android'
        })
      },
      env
    );

    expect(response.status).toBe(200);
    expect(executed).toContainEqual({
      sql: 'DELETE FROM fcm_tokens WHERE user_id = ? AND platform = ? AND target_type <> ?',
      bindings: ['user-1', 'android', 'fid']
    });
    expect(executed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringContaining(
            'INSERT INTO fcm_tokens (id, user_id, token, target_type, platform'
          ),
          bindings: expect.arrayContaining(['user-1', 'fid-123', 'fid', 'android'])
        })
      ])
    );
  });

  it('refreshes the app JWT with the latest premium flag', async () => {
    const user = {
      id: 'user-1',
      firebase_uid: 'firebase-1',
      sign: 'aries',
      language: 'tr',
      utc_offset: 3,
      is_premium: 1,
      subscription_state: 'grace_period',
      premium_expires_at: '2026-04-15T12:00:00.000Z',
      created_at: '2026-04-10T10:00:00.000Z',
      last_seen_at: '2026-04-10T10:00:00.000Z'
    };
    const env = createTestEnv({
      DB: {
        prepare(sql: string) {
          const statement = {
            bind() {
              return statement;
            },
            async first() {
              if (sql.includes('SELECT 1 AS ok FROM users')) return { ok: 1 };
              if (sql.includes('SELECT * FROM users WHERE id = ?')) {
                return user;
              }
              return null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              return { success: true, meta: {} };
            }
          };
          return statement;
        },
        async batch() {
          return [];
        }
      } as unknown as D1Database
    });
    const app = createApp();
    const jwt = await signAppJwt(env, {
      userId: user.id,
      isPremium: false,
      firebaseUid: user.firebase_uid
    });

    const response = await app.request(
      '/api/v1/users/refresh-token',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${jwt}`
        }
      },
      env
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      jwt: string;
      is_premium: boolean;
      subscription_state: string;
    };
    const claims = await verifyAppJwt(env, body.jwt);

    expect(body.is_premium).toBe(true);
    expect(body.subscription_state).toBe('grace_period');
    expect(claims.is_premium).toBe(true);
    expect(claims.user_id).toBe(user.id);
    expect(claims.firebase_uid).toBe(user.firebase_uid);
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(60 * 60);
  });

  it('deletes user data, reward keys, and the Firebase account', async () => {
    const { db, batched } = createDeletionDb();
    const deletedKeys: string[] = [];
    const list = vi.fn().mockResolvedValue({
      keys: [{ name: 'reward:user-1:daily:2026-07-20' }],
      list_complete: true,
      cacheStatus: null
    });
    const cache = {
      async get() {
        return null;
      },
      async put() {
        return;
      },
      async delete(key: string) {
        deletedKeys.push(key);
      },
      list
    } as unknown as KVNamespace;
    const env = createTestEnv({ DB: db, CACHE: cache });
    const jwt = await signAppJwt(env, {
      userId: 'user-1',
      isPremium: false,
      firebaseUid: 'firebase-1'
    });

    const response = await createApp().request(
      '/api/v1/users/me',
      {
        method: 'DELETE',
        headers: { authorization: `Bearer ${jwt}` }
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      user_id: 'user-1',
      firebase_account_deleted: true
    });
    expect(batched.map((statement) => statement.sql.replace(/\s+/g, ' ').trim())).toEqual([
      'DELETE FROM subscription_events WHERE user_id = ?',
      'DELETE FROM user_events WHERE user_id = ?',
      'DELETE FROM reward_challenges WHERE user_id = ?',
      'DELETE FROM fcm_tokens WHERE user_id = ?',
      'DELETE FROM subscriptions WHERE user_id = ?',
      'DELETE FROM user_birth_data WHERE user_id = ?',
      'DELETE FROM users WHERE id = ?'
    ]);
    expect(batched.every((statement) => statement.bindings[0] === 'user-1')).toBe(true);
    expect(list).toHaveBeenCalledWith({ prefix: 'reward:user-1:' });
    expect(deletedKeys).toEqual(['reward:user-1:daily:2026-07-20']);
    expect(deleteFirebaseUserMock).toHaveBeenCalledWith(env, 'firebase-1');
  });

  it('completes critical deletion when reward cache cleanup fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { db } = createDeletionDb();
    const cache = {
      async get() {
        return null;
      },
      async put() {
        return;
      },
      async delete() {
        return;
      },
      async list() {
        throw new Error('kv unavailable');
      }
    } as unknown as KVNamespace;
    const env = createTestEnv({ DB: db, CACHE: cache });
    const jwt = await signAppJwt(env, {
      userId: 'user-1',
      isPremium: false,
      firebaseUid: 'firebase-1'
    });

    const response = await createApp().request(
      '/api/v1/users/me',
      {
        method: 'DELETE',
        headers: { authorization: `Bearer ${jwt}` }
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      user_id: 'user-1',
      firebase_account_deleted: true
    });
    expect(deleteFirebaseUserMock).toHaveBeenCalledWith(env, 'firebase-1');
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it('rejects account deletion when the app JWT lacks a Firebase UID', async () => {
    const { db, batched } = createDeletionDb();
    const env = createTestEnv({ DB: db });
    const jwt = await signAppJwt(env, {
      userId: 'user-1',
      isPremium: false
    });

    const response = await createApp().request(
      '/api/v1/users/me',
      {
        method: 'DELETE',
        headers: { authorization: `Bearer ${jwt}` }
      },
      env
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'FIREBASE_IDENTITY_MISSING',
        message: 'Firebase identity is required to delete the account.'
      }
    });
    expect(batched).toEqual([]);
    expect(deleteFirebaseUserMock).not.toHaveBeenCalled();
  });

  it('returns a safe 502 response when Firebase account deletion fails', async () => {
    const { db } = createDeletionDb();
    const cache = {
      async get() {
        return null;
      },
      async put() {
        return;
      },
      async delete() {
        return;
      },
      async list() {
        return { keys: [], list_complete: true, cacheStatus: null };
      }
    } as unknown as KVNamespace;
    const env = createTestEnv({ DB: db, CACHE: cache });
    const jwt = await signAppJwt(env, {
      userId: 'user-1',
      isPremium: false,
      firebaseUid: 'firebase-1'
    });
    deleteFirebaseUserMock.mockRejectedValue(new FirebaseAccountDeletionError(403));

    const response = await createApp().request(
      '/api/v1/users/me',
      {
        method: 'DELETE',
        headers: { authorization: `Bearer ${jwt}` }
      },
      env
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'FIREBASE_DELETION_FAILED',
        message: 'Firebase account deletion failed. Retry the request.'
      }
    });
  });

  it('returns a safe 500 response when user data deletion fails', async () => {
    const { db } = createDeletionDb();
    const failingDb = {
      ...db,
      async batch() {
        throw new Error('sensitive database details');
      }
    } as unknown as D1Database;
    const env = createTestEnv({ DB: failingDb });
    const jwt = await signAppJwt(env, {
      userId: 'user-1',
      isPremium: false,
      firebaseUid: 'firebase-1'
    });

    const response = await createApp().request(
      '/api/v1/users/me',
      {
        method: 'DELETE',
        headers: { authorization: `Bearer ${jwt}` }
      },
      env
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: 'ACCOUNT_DELETION_FAILED',
        message: 'Account data could not be deleted. Retry the request.'
      }
    });
    expect(JSON.stringify(body)).not.toContain('sensitive database details');
    expect(deleteFirebaseUserMock).not.toHaveBeenCalled();
  });

  it('requires authentication for account deletion', async () => {
    const response = await createApp().request(
      '/api/v1/users/me',
      { method: 'DELETE' },
      createTestEnv()
    );

    expect(response.status).toBe(401);
  });
});
