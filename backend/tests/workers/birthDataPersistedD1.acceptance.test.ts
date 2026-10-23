import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createApp } from '@/index';
import { signAppJwt } from '@/utils/jwt';
import { createTestEnv } from '../helpers/env';

const { Miniflare, convertV4MiniflareOptions } = createRequire(import.meta.url)('miniflare') as typeof import('miniflare');

describe('account-scoped birth-data deletion in persistent local D1', () => {
  it('preserves authentication and another user after DELETE and database restart', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'astro-birth-d1-'));
    const createLocalDatabase = () =>
      new Miniflare(
        convertV4MiniflareOptions({
          modules: true,
          script: 'export default {fetch(){return new Response("local-qa")}}',
          compatibilityDate: '2026-04-05',
          d1Databases: { DB: 'astro-birth-synthetic' },
          resourcePersistencePath: directory
        })
      );

    let runtime = createLocalDatabase();
    try {
      let db = await runtime.getD1Database('DB');
      await db.exec("CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL, is_premium INTEGER NOT NULL DEFAULT 0, subscription_state TEXT NOT NULL DEFAULT 'none', premium_expires_at TEXT);");
      await db.prepare(readFileSync('migrations/0003_user_birth_data.sql', 'utf8')).run();
      await db.prepare('INSERT INTO users (id) VALUES (?), (?)').bind('synthetic-user-1', 'synthetic-user-2').run();

      const env = createTestEnv({ DB: db });
      const headersA = {
        authorization: `Bearer ${await signAppJwt(env, { userId: 'synthetic-user-1', isPremium: false })}`,
        'content-type': 'application/json'
      };
      const headersB = {
        authorization: `Bearer ${await signAppJwt(env, { userId: 'synthetic-user-2', isPremium: false })}`,
        'content-type': 'application/json'
      };
      const profile = {
        local_date: '1990-06-15',
        local_time: '14:30:00',
        time_certainty: 'exact',
        city_id: 'istanbul-tr'
      };
      const endpoint = '/api/v1/users/me/birth-data';
      const request = (method: 'GET' | 'PUT' | 'DELETE', headers: typeof headersA, body?: typeof profile) =>
        createApp().request(endpoint, { method, headers, body: body ? JSON.stringify(body) : undefined }, env);

      expect((await request('PUT', headersA, profile)).status).toBe(200);
      expect((await request('PUT', headersB, profile)).status).toBe(200);
      expect((await createApp().request(endpoint, { method: 'DELETE' }, env)).status).toBe(401);
      const deleted = await request('DELETE', headersA);
      expect(deleted.status).toBe(200);
      await expect(deleted.json()).resolves.toEqual({ ok: true });
      await expect((await request('GET', headersA)).json()).resolves.toEqual({
        time_certainty: 'unknown', has_birth_data: false
      });
      await expect((await request('GET', headersB)).json()).resolves.toEqual({
        time_certainty: 'exact', has_birth_data: true
      });

      await runtime.dispose();
      runtime = createLocalDatabase();
      db = await runtime.getD1Database('DB');
      const persistentEnv = createTestEnv({ DB: db });
      const app = createApp();
      const afterRestartA = await app.request(endpoint, { method: 'GET', headers: headersA }, persistentEnv);
      const afterRestartB = await app.request(endpoint, { method: 'GET', headers: headersB }, persistentEnv);
      expect(afterRestartA.status).toBe(200);
      expect(afterRestartB.status).toBe(200);
      await expect(afterRestartA.json()).resolves.toMatchObject({ has_birth_data: false });
      await expect(afterRestartB.json()).resolves.toMatchObject({ has_birth_data: true });
      const idempotent = await app.request(endpoint, { method: 'DELETE', headers: headersA }, persistentEnv);
      expect(idempotent.status).toBe(200);
      expect((await db.prepare('SELECT count(*) AS n FROM users').first<{ n: number }>())?.n).toBe(2);
    } finally {
      await runtime.dispose();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
