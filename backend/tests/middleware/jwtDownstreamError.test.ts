import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { jwtAuthMiddleware } from '@/middleware/auth';
import { signAppJwt } from '@/utils/jwt';
import type { AppBindings } from '@/types';
import { createTestEnv } from '../helpers/env';

describe('jwtAuthMiddleware exception boundary', () => {
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
