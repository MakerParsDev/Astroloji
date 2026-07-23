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
                return { results: [] };
              }

              if (sql.includes('FROM users u') && sql.includes('LIMIT ? OFFSET ?')) {
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
              return { success: true, meta: {} };
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
