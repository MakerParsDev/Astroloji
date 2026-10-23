import { createRequire } from 'node:module';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { jwtAuthMiddleware } from '@/middleware/auth';
import type { AppBindings } from '@/types';
import { signAppJwt } from '@/utils/jwt';
import { createTestEnv } from '../helpers/env';

const { Miniflare, convertV4MiniflareOptions } =
  createRequire(import.meta.url)('miniflare') as typeof import('miniflare');

describe('JWT-backed live premium entitlement', () => {
  it('honors current D1 status and expiry across requests carrying the same signed JWT', async () => {
    const runtime = new Miniflare(convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-04-05',
      d1Databases: { DB: 'astro-auth-live-entitlements' }
    }));
    try {
      const db = await runtime.getD1Database('DB');
      await db.exec('CREATE TABLE users (id TEXT PRIMARY KEY, is_premium INTEGER, subscription_state TEXT, premium_expires_at TEXT);');
      await db.prepare('INSERT INTO users (id, is_premium, subscription_state, premium_expires_at) VALUES (?, 1, ?, ?)').bind(
        'user-1', 'active', '2030-01-01T00:00:00.000Z'
      ).run();
      const env = createTestEnv({ DB: db });
      const app = new Hono<AppBindings>();
      app.use('*', jwtAuthMiddleware);
      app.get('/protected', (c) => c.json({ premium: c.get('auth').isPremium }));
      const stalePremiumJwt = await signAppJwt(env, { userId: 'user-1', isPremium: true });
      const staleFreeJwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });
      const request = (token: string) => app.request('/protected', {
        headers: { authorization: `Bearer ${token}` }
      }, env);
      const set = async (premium: number, status: string, expiry: string | null) => {
        await db.prepare('UPDATE users SET is_premium = ?, subscription_state = ?, premium_expires_at = ? WHERE id = ?')
          .bind(premium, status, expiry, 'user-1').run();
      };

      await expect((await request(staleFreeJwt)).json()).resolves.toEqual({ premium: true });
      await set(0, 'expired', '2030-01-01T00:00:00.000Z');
      await expect((await request(stalePremiumJwt)).json()).resolves.toEqual({ premium: false });
      await set(1, 'active', '2020-01-01T00:00:00.000Z');
      await expect((await request(stalePremiumJwt)).json()).resolves.toEqual({ premium: false });
      await set(1, 'on_hold', '2030-01-01T00:00:00.000Z');
      await expect((await request(stalePremiumJwt)).json()).resolves.toEqual({ premium: false });
      await set(1, 'grace_period', '2030-01-01T00:00:00.000Z');
      await expect((await request(staleFreeJwt)).json()).resolves.toEqual({ premium: true });
      await set(1, 'cancelled', '2030-01-01T00:00:00.000Z');
      await expect((await request(staleFreeJwt)).json()).resolves.toEqual({ premium: true });
      await set(1, 'paused', '2030-01-01T00:00:00.000Z');
      await expect((await request(stalePremiumJwt)).json()).resolves.toEqual({ premium: false });
      await db.prepare('DELETE FROM users WHERE id = ?').bind('user-1').run();
      expect((await request(stalePremiumJwt)).status).toBe(401);
    } finally {
      await runtime.dispose();
    }
  });

  it('reports D1 outages as server errors, not an invalid JWT', async () => {
    const db = {
      prepare() { throw new Error('D1 connection down'); }
    } as unknown as D1Database;
    const env = createTestEnv({ DB: db });
    const app = new Hono<AppBindings>();
    app.use('*', jwtAuthMiddleware);
    app.get('/protected', (c) => c.json({ premium: c.get('auth').isPremium }));
    const token = await signAppJwt(env, { userId: 'user-1', isPremium: true });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await app.request('/protected', {
        headers: { authorization: `Bearer ${token}` }
      }, env);
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain('INVALID_TOKEN');
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
