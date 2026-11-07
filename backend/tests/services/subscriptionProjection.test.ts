import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import { createPremiumProjectionStatement } from '@/services/subscriptionProjection';

const { Miniflare, convertV4MiniflareOptions } =
  createRequire(import.meta.url)('miniflare') as typeof import('miniflare');

const now = '2026-11-07T15:00:00.000Z';
const past = '2026-11-06T15:00:00.000Z';
const future = '2026-11-14T15:00:00.000Z';

describe('effective premium projection across Play tokens', () => {
  async function withDb(
    run: (db: D1Database) => Promise<void>,
    otherStatus: string | null = 'active',
    otherExpiry = future
  ) {
    const runtime = new Miniflare(convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("local-test")}}',
      compatibilityDate: '2026-04-05',
      d1Databases: { DB: 'astro-multi-token-projection' }
    }));
    try {
      const db = await runtime.getD1Database('DB');
      await db.exec([
        'CREATE TABLE users (id TEXT PRIMARY KEY, is_premium INTEGER, subscription_state TEXT, premium_expires_at TEXT, last_seen_at TEXT);',
        'CREATE TABLE subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, purchase_token TEXT UNIQUE, status TEXT, expires_at TEXT);'
      ].join('\n'));
      await db.prepare('INSERT INTO users (id, is_premium, subscription_state, premium_expires_at) VALUES (?, ?, ?, ?)')
        .bind('user-1', 1, 'active', future).run();
      await db.prepare('INSERT INTO subscriptions (id, user_id, purchase_token, status, expires_at) VALUES (?, ?, ?, ?, ?)')
        .bind('old', 'user-1', 'old-token', 'expired', past).run();
      if (otherStatus !== null) {
        await db.prepare('INSERT INTO subscriptions (id, user_id, purchase_token, status, expires_at) VALUES (?, ?, ?, ?, ?)')
          .bind('new', 'user-1', 'new-token', otherStatus, otherExpiry).run();
      }
      await run(db);
    } finally {
      await runtime.dispose();
    }
  }

  const read = (db: D1Database) =>
    db.prepare('SELECT is_premium, subscription_state, premium_expires_at FROM users WHERE id = ?')
      .bind('user-1')
      .first<{ is_premium: number; subscription_state: string; premium_expires_at: string }>();

  it('preserves the active replacement when the old token expires', async () => {
    await withDb(async (db) => {
      await createPremiumProjectionStatement(db, {
        userId: 'user-1', now, fallbackStatus: 'expired', fallbackExpiresAt: past
      }).run();
      expect(await read(db)).toMatchObject({
        is_premium: 1, subscription_state: 'active', premium_expires_at: future
      });
    });
  });

  it.each(['cancelled', 'grace_period'])('retains a time-valid %s replacement', async (status) => {
    await withDb(async (db) => {
      await createPremiumProjectionStatement(db, {
        userId: 'user-1', now, fallbackStatus: 'expired', fallbackExpiresAt: past
      }).run();
      expect(await read(db)).toMatchObject({
        is_premium: 1, subscription_state: status, premium_expires_at: future
      });
    }, status);
  });

  it.each([null, 'on_hold', 'paused', 'expired'])(
    'revokes when there is no eligible replacement (%s)',
    async (otherStatus) => {
      await withDb(async (db) => {
        await createPremiumProjectionStatement(db, {
          userId: 'user-1', now, fallbackStatus: 'expired', fallbackExpiresAt: past
        }).run();
        expect(await read(db)).toMatchObject({
          is_premium: 0, subscription_state: 'expired', premium_expires_at: past
        });
      }, otherStatus);
    }
  );

  it('keeps RTDN lease-fenced projections from updating after ownership is lost', async () => {
    await withDb(async (db) => {
      await createPremiumProjectionStatement(db, {
        userId: 'user-1', now, fallbackStatus: 'expired', fallbackExpiresAt: past,
        guardSql: '? = 1', guardBindings: [0]
      }).run();
      expect(await read(db)).toMatchObject({
        is_premium: 1, subscription_state: 'active', premium_expires_at: future
      });
    }, null);
  });
});
