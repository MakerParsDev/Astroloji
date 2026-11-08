import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendBatchNotifications, createPersonalGuidance, getDecryptedBirthData } = vi.hoisted(() => ({
  sendBatchNotifications: vi.fn(),
  createPersonalGuidance: vi.fn(),
  getDecryptedBirthData: vi.fn()
}));

vi.mock('@/services/fcm', () => ({
  sendBatchNotifications
}));

vi.mock('@/services/playBilling', () => ({
  getSubscriptionStatus: vi.fn(),
  hasPremiumEntitlement: vi.fn()
}));

vi.mock('@/chart-engine/personalGuidance', () => ({
  createPersonalGuidance
}));

vi.mock('@/workers/birthData', () => ({
  getDecryptedBirthData
}));

const { Miniflare, convertV4MiniflareOptions } = createRequire(import.meta.url)('miniflare') as typeof import('miniflare');

import { getSubscriptionStatus, hasPremiumEntitlement } from '@/services/playBilling';
import { handleCron, buildDailyNotificationTitle } from '@/workers/cron';
import { createTestEnv } from '../helpers/env';

describe('cron worker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T09:00:00.000Z'));
    sendBatchNotifications.mockReset();
    createPersonalGuidance.mockReset();
    getDecryptedBirthData.mockReset();
    getDecryptedBirthData.mockResolvedValue(null);
  });

  it('uses localized Turkish sign labels with proper diacritics', () => {
    expect(buildDailyNotificationTitle('aries', 'tr')).toBe('Koç Burcu Bugün');
    expect(buildDailyNotificationTitle('pisces', 'tr')).toBe('Balık Burcu Bugün');
  });

  it('uses English labels for English notifications', () => {
    expect(buildDailyNotificationTitle('aries', 'en')).toBe('Aries Horoscope Today');
  });

  it('runs expiry reconciliation and paged notification dispatch on the hourly cron', async () => {
    const seenOffsets: number[] = [];
    const writes: string[] = [];
    const operations: string[] = [];
    const env = createTestEnv({
      DB: {
        prepare(sql: string) {
          let bindings: unknown[] = [];
          const statement = {
            bind(...args: unknown[]) {
              bindings = args;
              return statement;
            },
            async first() {
              return null;
            },
            async all() {
              if (sql.includes("FROM subscriptions WHERE status IN ('active', 'cancelled', 'grace_period')")) {
                operations.push('subscriptions');
                return { success: true, results: [] };
              }

              if (sql.includes('FROM users u') && sql.includes('LIMIT ? OFFSET ?')) {
                operations.push('notifications');
                const [, offset] = bindings as [number, number];
                seenOffsets.push(offset);
                if (offset === 0) {
                  return {
                    results: Array.from({ length: 500 }, (_, index) => ({
                      user_id: `user-${index + 1}`,
                      sign: 'aries',
                      language: 'tr',
                      utc_offset: 0,
                      token: `token-${index + 1}`,
                      target_type: 'token',
                      notification_hour: 9
                    }))
                  };
                }

                if (offset === 500) {
                  return {
                    results: [
                      {
                        user_id: 'user-3',
                        sign: 'aries',
                        language: 'tr',
                        utc_offset: 0,
                        token: 'fid-3',
                        target_type: 'fid',
                        notification_hour: 9
                      }
                    ]
                  };
                }

                return { success: true, results: [] };
              }

              return { success: true, results: [] };
            },
            async run() {
              const normalized = sql.replace(/\s+/g, ' ').trim();
              writes.push(normalized);
              if (normalized.startsWith('DELETE FROM reward_challenges')) {
                operations.push('cleanup');
              }
              return { success: true, meta: { changes: 0 } };
            }
          };
          return statement;
        },
        async batch() {
          return [];
        }
      } as unknown as D1Database,
      CONTENT: {
        async head() {
          return { size: 1 } as R2Object;
        },
        async get() {
          return {
            async json() {
              return {
                date: '2026-04-10',
                language: 'tr',
                signs: {
                  aries: {
                    short: 'Bugün enerjin yüksek.',
                    full: 'Premium yorum',
                    love: 'Aşk',
                    career: 'Kariyer',
                    money: 'Para',
                    health: 'Sağlık',
                    lucky_number: 7,
                    lucky_color: 'Kırmızı',
                    energy: 88,
                    love_score: 70,
                    career_score: 81,
                    money_score: 65,
                    health_score: 76,
                    daily_tip: 'Odaklan'
                  }
                }
              };
            }
          } as R2ObjectBody;
        }
      } as unknown as R2Bucket
    });

    await handleCron(
      { cron: '0 * * * *' } as ScheduledController,
      env,
      {} as ExecutionContext
    );

    expect(writes.some((sql) => sql.startsWith('DELETE FROM reward_challenges'))).toBe(true);
    expect(operations).toContain('subscriptions');
    expect(operations).toContain('notifications');
    expect(operations.indexOf('subscriptions')).toBeLessThan(operations.indexOf('notifications'));
    expect(operations.at(-1)).toBe('cleanup');
    expect(seenOffsets).toEqual([0, 500]);
    expect(sendBatchNotifications).toHaveBeenCalledTimes(1);
    expect(sendBatchNotifications).toHaveBeenCalledWith(
      env,
      [
        ...Array.from({ length: 500 }, (_, index) => ({
          type: 'token',
          value: `token-${index + 1}`
        })),
        { type: 'fid', value: 'fid-3' }
      ],
      'Koç Burcu Bugün',
      'Bugün enerjin yüksek.',
      {
        type: 'daily',
        sign: 'aries',
        date: '2026-04-10'
      }
    );
  });

  it('rejects an unsuccessful expiry queue read rather than claiming no subscriptions are due', async () => {
    const base = createTestEnv();
    const failingDb = {
      prepare(sql: string) {
        if (sql.includes('FROM subscriptions WHERE status IN')) {
          const statement = {
            bind() { return statement; },
            async all() { return { success: false, results: [] }; }
          };
          return statement as unknown as D1PreparedStatement;
        }
        return base.DB.prepare(sql);
      }
    } as D1Database;
    const env = createTestEnv({ DB: failingDb });
    await expect(handleCron({ cron: '0 * * * *' } as ScheduledController, env, {} as ExecutionContext))
      .rejects.toThrow('Subscription expiry query was not confirmed.');
    expect(sendBatchNotifications).not.toHaveBeenCalled();
  });

  it('rolls back expired subscription and Premium writes if the final event insert fails in real D1', async () => {
    // Miniflare startup uses timers; the other Cron tests intentionally use fake time.
    vi.useRealTimers();
    const runtime = new Miniflare(convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("cron-local")}}',
      compatibilityDate: '2026-04-05',
      d1Databases: { DB: 'astrology-cron-atomic-expiry' }
    }));
    try {
      const db = await runtime.getD1Database('DB');
      await db.exec([
        'CREATE TABLE users (id TEXT PRIMARY KEY, is_premium INTEGER NOT NULL, subscription_state TEXT, premium_expires_at TEXT, last_seen_at TEXT);',
        'CREATE TABLE subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, purchase_token TEXT NOT NULL, product_id TEXT NOT NULL, status TEXT NOT NULL, starts_at TEXT, expires_at TEXT NOT NULL, auto_renewing INTEGER NOT NULL, cancel_reason TEXT, created_at TEXT, updated_at TEXT);',
        'CREATE TABLE subscription_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, purchase_token TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT, created_at TEXT NOT NULL);',
        "INSERT INTO users (id, is_premium, subscription_state, premium_expires_at) VALUES ('user-1', 1, 'active', '2026-04-09T00:00:00.000Z');",
        "INSERT INTO subscriptions (id, user_id, purchase_token, product_id, status, expires_at, auto_renewing) VALUES ('sub-1', 'user-1', 'token-1', 'premium_weekly', 'active', '2026-04-09T00:00:00.000Z', 0);",
        "CREATE TRIGGER reject_event BEFORE INSERT ON subscription_events BEGIN SELECT RAISE(ABORT, 'injected event write failure'); END;"
      ].join('\n'));
      const env = createTestEnv({
        DB: {
          prepare(sql: string) {
            if (sql.includes('FROM account_deletion_jobs') || sql.includes('FROM users u')) {
              const stmt = { bind() { return stmt; }, async all() { return { success: true, results: [] }; } };
              return stmt as unknown as D1PreparedStatement;
            }
            if (sql.startsWith('DELETE FROM reward_challenges')) {
              const stmt = { bind() { return stmt; }, async run() { return { success: true, meta: { changes: 0 } }; } };
              return stmt as unknown as D1PreparedStatement;
            }
            return db.prepare(sql);
          },
          batch: (statements: D1PreparedStatement[]) => db.batch(statements)
        } as D1Database
      });
      vi.mocked(getSubscriptionStatus).mockResolvedValue({
        purchaseToken: 'token-1', productId: 'premium_weekly',
        status: 'expired', startsAt: '2026-04-01T00:00:00.000Z',
        expiresAt: '2026-04-09T00:00:00.000Z', autoRenewing: false, cancelReason: null,
        raw: {} as never
      });
      vi.mocked(hasPremiumEntitlement).mockReturnValue(false);
      await expect(handleCron({ cron: '0 * * * *' } as ScheduledController, env, {} as ExecutionContext))
        .rejects.toThrow('injected event write failure');
      const state = await db.prepare('SELECT status FROM subscriptions WHERE id = ?').bind('sub-1')
        .first<{ status: string }>();
      const user = await db.prepare('SELECT is_premium FROM users WHERE id = ?').bind('user-1')
        .first<{ is_premium: number }>();
      expect(state?.status).toBe('active');
      expect(user?.is_premium).toBe(1);
      expect((await db.prepare('SELECT COUNT(*) AS n FROM subscription_events').first<{ n: number }>())?.n).toBe(0);

      // A subsequent hourly retry after the transient failure succeeds as one unit.
      await db.exec('DROP TRIGGER reject_event;');
      await handleCron({ cron: '0 * * * *' } as ScheduledController, env, {} as ExecutionContext);
      const recovered = await db.prepare('SELECT status FROM subscriptions WHERE id = ?')
        .bind('sub-1').first<{ status: string }>();
      const premium = await db.prepare('SELECT is_premium FROM users WHERE id = ?')
        .bind('user-1').first<{ is_premium: number }>();
      expect(recovered?.status).toBe('expired');
      expect(premium?.is_premium).toBe(0);
      expect((await db.prepare('SELECT COUNT(*) AS n FROM subscription_events').first<{ n: number }>())?.n).toBe(1);
    } finally {
      await runtime.dispose();
    }
  });

  function createSingleUserEnv() {
    return createTestEnv({
      DB: {
        prepare(sql: string) {
          const statement = {
            bind() {
              return statement;
            },
            async first() {
              return null;
            },
            async all() {
              if (sql.includes('FROM users u') && sql.includes('LIMIT ? OFFSET ?')) {
                return {
                  results: [
                    {
                      user_id: 'user-1',
                      sign: 'aries',
                      language: 'tr',
                      utc_offset: 0,
                      token: 'token-1',
                      target_type: 'token',
                      notification_hour: 9
                    }
                  ]
                };
              }
              return { success: true, results: [] };
            },
            async run() {
              return { success: true, meta: { changes: 0 } };
            }
          };
          return statement;
        },
        async batch() {
          return [];
        }
      } as unknown as D1Database,
      CONTENT: {
        async head() {
          return { size: 1 } as R2Object;
        },
        async get() {
          return {
            async json() {
              return {
                date: '2026-04-10',
                language: 'tr',
                signs: {
                  aries: {
                    short: 'Bugün enerjin yüksek.',
                    full: 'Premium yorum',
                    love: 'Aşk',
                    career: 'Kariyer',
                    money: 'Para',
                    health: 'Sağlık',
                    lucky_number: 7,
                    lucky_color: 'Kırmızı',
                    energy: 88,
                    love_score: 70,
                    career_score: 81,
                    money_score: 65,
                    health_score: 76,
                    daily_tip: 'Odaklan'
                  }
                }
              };
            }
          } as R2ObjectBody;
        }
      } as unknown as R2Bucket
    });
  }

  it('sends a personalized transit notification instead of the generic daily one when a strong signal exists', async () => {
    const env = createSingleUserEnv();
    getDecryptedBirthData.mockResolvedValue({
      plaintext: { timestamp: '1990-01-15T12:00:00.000Z', latitude: 41, longitude: 29, tzid: 'Europe/Istanbul' },
      timeCertainty: 'exact'
    });
    createPersonalGuidance.mockReturnValue({
      version: 'personal-guidance-v1',
      calculationVersion: 'guidance-rules-v1',
      generatedAt: '2026-04-10T09:00:00.000Z',
      targetTimestamp: '2026-04-10T09:00:00.000Z',
      language: 'tr',
      signals: [
        {
          id: 'mars_square_saturn',
          priority: 90,
          domain: 'action',
          title: 'Mars, natal Satürn ile kare',
          summary: 'Bugün sınırlarını netleştirmen gerekebilir.',
          actionPrompt: 'Küçük bir adım seç.',
          evidence: { transitBody: 'mars', natalBody: 'saturn', aspect: 'square', orb: 0.4, maximumOrb: 6 }
        }
      ],
      limitations: [],
      disclaimer: 'disclaimer'
    });

    await handleCron({ cron: '0 * * * *' } as ScheduledController, env, {} as ExecutionContext);

    expect(sendBatchNotifications).toHaveBeenCalledWith(
      env,
      [{ type: 'token', value: 'token-1' }],
      'Mars, natal Satürn ile kare',
      'Bugün sınırlarını netleştirmen gerekebilir.',
      {
        type: 'transit',
        signal_id: 'mars_square_saturn',
        domain: 'action',
        date: '2026-04-10'
      }
    );
  });

  it('falls back to the generic daily notification when the strongest signal is below the meaningfulness threshold', async () => {
    const env = createSingleUserEnv();
    getDecryptedBirthData.mockResolvedValue({
      plaintext: { timestamp: '1990-01-15T12:00:00.000Z', latitude: 41, longitude: 29, tzid: 'Europe/Istanbul' },
      timeCertainty: 'exact'
    });
    createPersonalGuidance.mockReturnValue({
      version: 'personal-guidance-v1',
      calculationVersion: 'guidance-rules-v1',
      generatedAt: '2026-04-10T09:00:00.000Z',
      targetTimestamp: '2026-04-10T09:00:00.000Z',
      language: 'tr',
      signals: [
        {
          id: 'moon_sextile_venus',
          priority: 40,
          domain: 'emotions',
          title: 'weak signal',
          summary: 'weak',
          actionPrompt: 'weak',
          evidence: { transitBody: 'moon', natalBody: 'venus', aspect: 'sextile', orb: 5.5, maximumOrb: 6 }
        }
      ],
      limitations: [],
      disclaimer: 'disclaimer'
    });

    await handleCron({ cron: '0 * * * *' } as ScheduledController, env, {} as ExecutionContext);

    expect(sendBatchNotifications).toHaveBeenCalledWith(
      env,
      [{ type: 'token', value: 'token-1' }],
      'Koç Burcu Bugün',
      'Bugün enerjin yüksek.',
      { type: 'daily', sign: 'aries', date: '2026-04-10' }
    );
  });

  it('falls back to the generic daily notification when the user has no saved birth data', async () => {
    const env = createSingleUserEnv();
    getDecryptedBirthData.mockResolvedValue(null);

    await handleCron({ cron: '0 * * * *' } as ScheduledController, env, {} as ExecutionContext);

    expect(createPersonalGuidance).not.toHaveBeenCalled();
    expect(sendBatchNotifications).toHaveBeenCalledWith(
      env,
      [{ type: 'token', value: 'token-1' }],
      'Koç Burcu Bugün',
      'Bugün enerjin yüksek.',
      { type: 'daily', sign: 'aries', date: '2026-04-10' }
    );
  });

  it('isolates cleanup failures after the main cron work', async () => {
    const cleanupError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const env = createTestEnv({
      DB: {
        prepare(sql: string) {
          const statement = {
            bind() {
              return statement;
            },
            async first() {
              return null;
            },
            async all() {
              return { success: true, results: [] };
            },
            async run() {
              if (sql.includes('DELETE FROM reward_challenges')) {
                throw new Error('cleanup unavailable');
              }
              return { success: true, meta: { changes: 0 } };
            }
          };
          return statement;
        },
        async batch() {
          return [];
        }
      } as unknown as D1Database
    });

    await expect(
      handleCron(
        { cron: '0 * * * *' } as ScheduledController,
        env,
        {} as ExecutionContext
      )
    ).resolves.toBeUndefined();

    expect(cleanupError).toHaveBeenCalledWith('Reward challenge cleanup failed.', {
      error: 'cleanup unavailable'
    });
  });

  it('ignores the legacy fixed-hour cron expressions', async () => {
    const env = createTestEnv();

    await handleCron(
      { cron: '0 9 * * *' } as ScheduledController,
      env,
      {} as ExecutionContext
    );

    expect(sendBatchNotifications).not.toHaveBeenCalled();
  });
});
