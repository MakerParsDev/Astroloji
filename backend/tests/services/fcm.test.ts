import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createGoogleAccessToken } = vi.hoisted(() => ({
  createGoogleAccessToken: vi.fn()
}));

vi.mock('@/utils/jwt', () => ({
  createGoogleAccessToken
}));

import { sendBatchNotifications } from '@/services/fcm';
import { createTestEnv } from '../helpers/env';

describe('FCM notification targets', () => {
  beforeEach(() => {
    createGoogleAccessToken.mockResolvedValue('access-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends legacy registration tokens through message token', async () => {
    const env = createTestEnv();

    await sendBatchNotifications(
      env,
      [{ type: 'token', value: 'legacy-token' }],
      'Title',
      'Body'
    );

    const request = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      message: {
        token: 'legacy-token'
      }
    });
    expect(JSON.parse(String(request.body)).message).not.toHaveProperty('fid');
  });


  it('removes only the matching invalid FID target', async () => {
    const deletes: Array<{ sql: string; bindings: unknown[] }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { status: 'UNREGISTERED' } }), { status: 404 })
      )
    );
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
              return null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              deletes.push({ sql, bindings: statement.bindings });
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

    const result = await sendBatchNotifications(
      env,
      [{ type: 'fid', value: 'fid-invalid' }],
      'Title',
      'Body'
    );

    expect(result).toMatchObject({ failed: 1, failedTokens: ['fid-invalid'] });
    expect(deletes).toEqual([
      {
        sql: 'DELETE FROM fcm_tokens WHERE token = ? AND target_type = ?',
        bindings: ['fid-invalid', 'fid']
      }
    ]);
  });

  it('sends Firebase installation IDs through message fid', async () => {
    const env = createTestEnv();

    await sendBatchNotifications(
      env,
      [{ type: 'fid', value: 'fid-123' }],
      'Title',
      'Body'
    );

    const request = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      message: {
        fid: 'fid-123'
      }
    });
    expect(JSON.parse(String(request.body)).message).not.toHaveProperty('token');
  });
});
