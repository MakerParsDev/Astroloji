import { createRequire } from 'node:module';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { jwtAuthMiddleware } from '@/middleware/auth';
import { createApp } from '@/index';
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


  it('keeps profile, refreshed JWT and premium access in sync with expiring D1 rows', async () => {
    const runtime = new Miniflare(convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("local-test")}}',
      compatibilityDate: '2026-04-05',
      d1Databases: { DB: 'astro-auth-profile-expiry' }
    }));
    try {
      const db = await runtime.getD1Database('DB');
      await db.exec([
        'CREATE TABLE users (id TEXT PRIMARY KEY, firebase_uid TEXT, sign TEXT, language TEXT, utc_offset INTEGER, is_premium INTEGER, subscription_state TEXT, premium_expires_at TEXT, created_at TEXT, last_seen_at TEXT);',
        'CREATE TABLE fcm_tokens (user_id TEXT, updated_at TEXT, notification_enabled INTEGER, notification_hour INTEGER);'
      ].join('\n'));
      await db.prepare('INSERT INTO users (id, firebase_uid, sign, language, utc_offset, is_premium, subscription_state, premium_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind('local-user', 'firebase-local', 'aries', 'tr', 3, 1, 'active', '2020-01-01T00:00:00.000Z').run();
      const env = createTestEnv({ DB: db });
      const app = createApp();
      const originalJwt = await signAppJwt(env, {
        userId: 'local-user',
        firebaseUid: 'firebase-local',
        isPremium: true
      });
      const request = async (path: string, method = 'GET') => {
        const response = await app.request(path, {
          method,
          headers: { authorization: `Bearer ${originalJwt}` }
        }, env);
        expect(response.status).toBe(200);
        return response.json() as Promise<Record<string, unknown>>;
      };
      const { verifyAppJwt } = await import('@/utils/jwt');

      const expiredProfile = await request('/api/v1/users/me');
      expect(expiredProfile.is_premium).toBe(false);
      const expiredRefresh = await request('/api/v1/users/refresh-token', 'POST');
      expect(expiredRefresh.is_premium).toBe(false);
      expect((await verifyAppJwt(env, expiredRefresh.jwt as string)).is_premium).toBe(false);
      const expiredProfileUpdate = await app.request('/api/v1/users/me', {
        method: 'PUT',
        headers: { authorization: `Bearer ${originalJwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sign: 'aries', language: 'tr', utc_offset: 3 })
      }, env);
      expect(expiredProfileUpdate.status).toBe(200);
      expect((await expiredProfileUpdate.json() as { is_premium: boolean }).is_premium).toBe(false);

      // Reusing the same signed JWT must not prevent real-time entitlement restoration.
      await db.prepare('UPDATE users SET premium_expires_at = ? WHERE id = ?')
        .bind('2099-01-01T00:00:00.000Z', 'local-user').run();
      const activeProfile = await request('/api/v1/users/me');
      expect(activeProfile.is_premium).toBe(true);
      const activeRefresh = await request('/api/v1/users/refresh-token', 'POST');
      expect(activeRefresh.is_premium).toBe(true);
      expect((await verifyAppJwt(env, activeRefresh.jwt as string)).is_premium).toBe(true);
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
