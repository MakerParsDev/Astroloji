import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendBatchNotifications } = vi.hoisted(() => ({
  sendBatchNotifications: vi.fn()
}));

vi.mock('@/services/fcm', () => ({
  sendBatchNotifications
}));

vi.mock('@/services/playBilling', () => ({
  getSubscriptionStatus: vi.fn(),
  hasPremiumEntitlement: vi.fn()
}));

import { handleCron, buildDailyNotificationTitle } from '@/workers/cron';
import { createTestEnv } from '../helpers/env';

describe('cron worker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T09:00:00.000Z'));
    sendBatchNotifications.mockReset();
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
              if (sql.includes("FROM subscriptions WHERE status IN ('active', 'cancelled')")) {
                operations.push('subscriptions');
                return { results: [] };
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
                        token: 'token-3',
                        notification_hour: 9
                      }
                    ]
                  };
                }

                return { results: [] };
              }

              return { results: [] };
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
    expect(operations.indexOf('subscriptions')).toBeLessThan(operations.indexOf('notifications'));
    expect(operations.at(-1)).toBe('cleanup');
    expect(seenOffsets).toEqual([0, 500]);
    expect(sendBatchNotifications).toHaveBeenCalledTimes(1);
    expect(sendBatchNotifications).toHaveBeenCalledWith(
      env,
      [...Array.from({ length: 500 }, (_, index) => `token-${index + 1}`), 'token-3'],
      'Koç Burcu Bugün',
      'Bugün enerjin yüksek.',
      {
        type: 'daily',
        sign: 'aries',
        date: '2026-04-10'
      }
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
              return { results: [] };
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
