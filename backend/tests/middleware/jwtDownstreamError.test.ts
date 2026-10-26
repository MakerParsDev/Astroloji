import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { jwtAuthMiddleware } from '@/middleware/auth';
import { signAppJwt } from '@/utils/jwt';
import type { AppBindings, AppContext } from '@/types';
import { createTestEnv } from '../helpers/env';

describe('jwtAuthMiddleware exception boundary', () => {
  it('propagates a rejection from next() rather than misclassifying it as an invalid JWT', async () => {
    const database = {
      prepare() {
        return {
          bind() {
            return { first: async () => ({ is_premium: 0, subscription_state: 'none', premium_expires_at: null }) };
          }
        };
      }
    } as unknown as D1Database;
    const env = createTestEnv({ DB: database });
    const token = await signAppJwt(env, { userId: 'user-1', isPremium: false });
    const context = {
      env,
      req: { header: (name: string) => name === 'authorization' ? `Bearer ${token}` : undefined },
      set: vi.fn(),
      json: vi.fn((body: unknown, options: { status: number }) => Response.json(body, { status: options.status }))
    } as unknown as AppContext;
    const failingNext = vi.fn(async () => { throw new Error('downstream unavailable'); });

    await expect(jwtAuthMiddleware(context, failingNext)).rejects.toThrow('downstream unavailable');
    expect(failingNext).toHaveBeenCalledOnce();
  });

  it('preserves downstream server errors as 500 rather than converting them into 401', async () => {
    const env = createTestEnv();
    const token = await signAppJwt(env, { userId: 'user-1', isPremium: false });
    const app = new Hono<AppBindings>();
    app.use('*', jwtAuthMiddleware);
    app.get('/boom', () => { throw new Error('intentional downstream failure'); });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await app.request('/boom', { headers: { authorization: `Bearer ${token}` } }, env);
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain('INVALID_TOKEN');
    } finally {
      log.mockRestore();
    }
  });
});
