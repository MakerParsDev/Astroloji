import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const { deleteFirebaseUserMock } = vi.hoisted(() => ({
  deleteFirebaseUserMock: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@/services/firebaseAuth', async () => ({
  ...await vi.importActual<typeof import('@/services/firebaseAuth')>('@/services/firebaseAuth'),
  deleteFirebaseUser: deleteFirebaseUserMock
}));

import { createApp } from '@/index';
import { reconcileAccountDeletions } from '@/workers/user';
import { signAppJwt } from '@/utils/jwt';
import { createTestEnv } from '../helpers/env';

const { Miniflare, convertV4MiniflareOptions } = createRequire(import.meta.url)('miniflare') as typeof import('miniflare');

const A = 'synthetic-privacy-A';
const B = 'synthetic-privacy-B';
const ENDPOINT = '/api/v1/users/me';

async function installLocalSchema(db: D1Database) {
  // D1 exec parses individual newline-delimited commands and rejects the
  // repository's multiline schema as a single statement. Prepare each SQL
  // statement instead, leaving the actual schema content unchanged.
  for (const file of ['schema.sql', 'migrations/0007_account_deletion_jobs.sql']) {
    const schema = readFileSync(file, 'utf8')
      .replace(/^--.*$/gm, '')
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith('PRAGMA '));
    for (const statement of schema) {
      await db.prepare(statement).run();
    }
  }
}

function makeMiniflare(directory: string) {
  return new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("local-only")}}',
    compatibilityDate: '2026-04-05',
    d1Databases: { DB: 'astro-privacy-acceptance' },
    resourcePersistencePath: directory
  }));
}

describe('privacy deletion — isolated persistent local D1 and synthetic accounts', () => {
  it('deletes only a requested mood date or all mood history without deleting other user data', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'astro-scoped-mood-d1-'));
    let runtime = makeMiniflare(dir);
    try {
      let db = await runtime.getD1Database('DB');
      await installLocalSchema(db);
      for (const userId of [A, B]) {
        await db.prepare(
          'INSERT INTO users (id, firebase_uid, sign, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(userId, 'firebase-' + userId, 'aries', '2026-10-26', '2026-10-26').run();
        await db.prepare(
          'INSERT INTO user_birth_data (user_id, time_certainty, encrypted_payload, encryption_iv, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(userId, 'unknown', 'encrypted-test', 'synthetic-iv', '2026-10-26', '2026-10-26').run();
        for (const date of ['2026-10-24', '2026-10-25']) {
          await db.prepare(
            'INSERT INTO mood_logs (id, user_id, date, mood, domain, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).bind(userId + date, userId, date, 'low', 'emotions', '2026-10-26').run();
        }
        for (const eventType of ['mood_logged', 'app_open']) {
          await db.prepare(
            'INSERT INTO user_events (id, user_id, event_type, meta, created_at) VALUES (?, ?, ?, ?, ?)'
          ).bind(userId + eventType, userId, eventType, '{}', '2026-10-26').run();
        }
      }
      const env = createTestEnv({ DB: db });
      const app = createApp();
      const headersA = { authorization: 'Bearer ' + await signAppJwt(env, {
        userId: A, firebaseUid: 'firebase-' + A, isPremium: false
      }) };
      const count = async (table: string, userId: string, clause = '') =>
        (await db.prepare('SELECT COUNT(*) AS n FROM ' + table + ' WHERE user_id = ? ' + clause)
          .bind(userId).first<{ n: number }>())?.n;

      expect((await app.request('/api/v1/mood/logs', { method: 'DELETE' }, env)).status).toBe(401);
      for (const date of ['2026-02-30', '2026-13-01', 'not-a-date']) {
        expect((await app.request('/api/v1/mood/logs/' + date, {
          method: 'DELETE', headers: headersA
        }, env)).status).toBe(400);
      }
      expect(await count('mood_logs', A)).toBe(2);

      expect((await app.request('/api/v1/mood/logs/2026-10-24', {
        method: 'DELETE', headers: headersA
      }, env)).status).toBe(200);
      expect(await count('mood_logs', A)).toBe(1);
      expect(await count('mood_logs', B)).toBe(2);
      // Date-specific removal cannot identify the original date of a legacy
      // analytics event, so the event is not erroneously attributed to it.
      expect(await count('user_events', A)).toBe(2);

      for (let i = 0; i < 2; i += 1) {
        const deleted = await app.request('/api/v1/mood/logs', {
          method: 'DELETE', headers: headersA
        }, env);
        expect(deleted.status).toBe(200);
        await expect(deleted.json()).resolves.toEqual({ ok: true });
      }
      expect(await count('mood_logs', A)).toBe(0);
      expect(await count('mood_logs', B)).toBe(2);
      expect(await count('user_events', A, "AND event_type = 'mood_logged'")).toBe(0);
      expect(await count('user_events', A, "AND event_type = 'app_open'")).toBe(1);
      expect(await count('user_events', B)).toBe(2);
      for (const userId of [A, B]) {
        expect((await db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?')
          .bind(userId).first<{ n: number }>())?.n).toBe(1);
        expect(await count('user_birth_data', userId)).toBe(1);
      }

      await runtime.dispose();
      runtime = makeMiniflare(dir);
      db = await runtime.getD1Database('DB');
      expect(await count('mood_logs', A)).toBe(0);
      expect(await count('mood_logs', B)).toBe(2);
    } finally {
      await runtime.dispose();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('preserves all D1 rows on an interrupted delete, then completes durable retry without a JWT', async () => {
    deleteFirebaseUserMock.mockReset().mockResolvedValue(undefined);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const dir = mkdtempSync(join(tmpdir(), 'astro-privacy-retry-'));
    let runtime = makeMiniflare(dir);
    try {
      const db = await runtime.getD1Database('DB');
      await installLocalSchema(db);
      for (const userId of [A, B]) {
        await db.prepare(
          'INSERT INTO users (id, firebase_uid, sign, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(userId, 'firebase-' + userId, 'aries', '2026-10-26', '2026-10-26').run();
        await db.prepare(
          'INSERT INTO mood_logs (id, user_id, date, mood, domain, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind('mood-' + userId, userId, '2026-10-25', 'low', 'emotions', '2026-10-26').run();
        await db.prepare(
          'INSERT INTO user_events (id, user_id, event_type, meta, created_at) VALUES (?, ?, ?, ?, ?)'
        ).bind('event-' + userId, userId, 'mood_logged', '{}', '2026-10-26').run();
      }
      // Fail after earlier DELETEs in the D1 batch. All earlier DELETEs must
      // roll back instead of silently losing only some account data.
      await db.prepare(
        `CREATE TRIGGER block_synthetic_user_delete BEFORE DELETE ON users
         WHEN OLD.id = 'synthetic-privacy-A'
         BEGIN SELECT RAISE(ABORT, 'injected atomic batch interruption'); END`
      ).run();
      const env = createTestEnv({ DB: db });
      const jwt = await signAppJwt(env, { userId: A, firebaseUid: 'firebase-' + A, isPremium: false });
      const deleted = await createApp().request(ENDPOINT, {
        method: 'DELETE', headers: { authorization: 'Bearer ' + jwt }
      }, env);
      expect(deleted.status).toBe(500);
      await expect(deleted.json()).resolves.toMatchObject({
        error: { code: 'ACCOUNT_DELETION_FAILED' }
      });

      for (const table of ['users', 'mood_logs', 'user_events']) {
        const column = table === 'users' ? 'id' : 'user_id';
        for (const userId of [A, B]) {
          expect((await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`)
            .bind(userId).first<{ n: number }>())?.n).toBe(1);
        }
      }
      expect((await db.prepare('SELECT COUNT(*) AS n FROM account_deletion_jobs WHERE user_id = ?')
        .bind(A).first<{ n: number }>())?.n).toBe(1);

      // The persisted deletion intent survives the request failure and is
      // reconciled without a valid app JWT after the database outage clears.
      await db.prepare('DROP TRIGGER block_synthetic_user_delete').run();
      await reconcileAccountDeletions(env);
      expect(deleteFirebaseUserMock).toHaveBeenCalledTimes(2);
      for (const table of ['users', 'mood_logs', 'user_events', 'account_deletion_jobs']) {
        const column = table === 'users' ? 'id' : 'user_id';
        expect((await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`)
          .bind(A).first<{ n: number }>())?.n).toBe(0);
      }
      for (const table of ['users', 'mood_logs', 'user_events']) {
        const column = table === 'users' ? 'id' : 'user_id';
        expect((await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`)
          .bind(B).first<{ n: number }>())?.n).toBe(1);
      }
    } finally {
      errorLog.mockRestore();
      await runtime.dispose();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('retains accounts and mood when deleting only the birth profile; removes account-scoped data on full deletion', async () => {
    deleteFirebaseUserMock.mockReset().mockResolvedValue(undefined);
    const dir = mkdtempSync(join(tmpdir(), 'astro-privacy-deletion-'));
    let runtime = makeMiniflare(dir);
    try {
      let db = await runtime.getD1Database('DB');
      await installLocalSchema(db);

      for (const userId of [A, B]) {
        await db.prepare(
          'INSERT INTO users (id, firebase_uid, sign, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(userId, 'firebase-' + userId, 'aries', '2026-10-26', '2026-10-26').run();
        await db.prepare(
          'INSERT INTO user_birth_data (user_id, time_certainty, encrypted_payload, encryption_iv, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(userId, 'exact', 'synthetic-ciphertext', 'synthetic-iv', '2026-10-26', '2026-10-26').run();
        await db.prepare(
          'INSERT INTO mood_logs (id, user_id, date, mood, domain, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind('mood-' + userId, userId, '2026-10-25', 'stressed', 'emotions', '2026-10-26').run();
        await db.prepare(
          'INSERT INTO user_events (id, user_id, event_type, meta, created_at) VALUES (?, ?, ?, ?, ?)'
        ).bind('evt-' + userId, userId, 'mood_logged', '{}', '2026-10-26').run();
      }

      const env = createTestEnv({ DB: db });
      const headersA = {
        authorization: 'Bearer ' + await signAppJwt(env, {
          userId: A, firebaseUid: 'firebase-' + A, isPremium: false
        })
      };
      const headersB = {
        authorization: 'Bearer ' + await signAppJwt(env, {
          userId: B, firebaseUid: 'firebase-' + B, isPremium: false
        })
      };
      const app = createApp();
      const birth = ENDPOINT + '/birth-data';

      expect((await app.request(birth, { method: 'DELETE' }, env)).status).toBe(401);
      expect((await app.request(birth, { method: 'DELETE', headers: headersA }, env)).status).toBe(200);
      await expect((await app.request(birth, { headers: headersA }, env)).json()).resolves.toMatchObject({
        has_birth_data: false
      });
      await expect((await app.request(birth, { headers: headersB }, env)).json()).resolves.toMatchObject({
        has_birth_data: true
      });
      for (const userId of [A, B]) {
        expect((await db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').bind(userId)
          .first<{ n: number }>())?.n).toBe(1);
        expect((await db.prepare('SELECT COUNT(*) AS n FROM mood_logs WHERE user_id = ?').bind(userId)
          .first<{ n: number }>())?.n).toBe(1);
      }

      // Full account deletion cannot operate on the other account's JWT or rows.
      expect((await app.request(ENDPOINT, { method: 'DELETE' }, env)).status).toBe(401);
      const deleted = await app.request(ENDPOINT, { method: 'DELETE', headers: headersA }, env);
      expect(deleted.status).toBe(200);
      await expect(deleted.json()).resolves.toMatchObject({ ok: true, user_id: A, firebase_account_deleted: true });
      expect(deleteFirebaseUserMock).toHaveBeenCalledExactlyOnceWith(env, 'firebase-' + A);

      for (const table of ['users', 'user_birth_data', 'mood_logs', 'user_events', 'account_deletion_jobs']) {
        const column = table === 'users' ? 'id' : 'user_id';
        expect((await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`)
          .bind(A).first<{ n: number }>())?.n).toBe(0);
      }
      expect((await db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').bind(B)
        .first<{ n: number }>())?.n).toBe(1);
      expect((await db.prepare('SELECT COUNT(*) AS n FROM user_birth_data WHERE user_id = ?').bind(B)
        .first<{ n: number }>())?.n).toBe(1);
      expect((await db.prepare('SELECT COUNT(*) AS n FROM mood_logs WHERE user_id = ?').bind(B)
        .first<{ n: number }>())?.n).toBe(1);
      expect((await db.prepare('SELECT COUNT(*) AS n FROM user_events WHERE user_id = ?').bind(B)
        .first<{ n: number }>())?.n).toBe(1);
      expect((await app.request(ENDPOINT, { headers: headersA }, env)).status).toBe(401);
      expect((await app.request(ENDPOINT, { headers: headersB }, env)).status).toBe(200);

      // Persistence across process restart, still purely isolated in a temporary directory.
      await runtime.dispose();
      runtime = makeMiniflare(dir);
      db = await runtime.getD1Database('DB');
      expect((await db.prepare('SELECT COUNT(*) AS n FROM mood_logs WHERE user_id = ?').bind(A)
        .first<{ n: number }>())?.n).toBe(0);
      expect((await db.prepare('SELECT COUNT(*) AS n FROM mood_logs WHERE user_id = ?').bind(B)
        .first<{ n: number }>())?.n).toBe(1);
    } finally {
      await runtime.dispose();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
