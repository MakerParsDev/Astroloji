import { describe, expect, it } from 'vitest';

import { createApp } from '@/index';
import {
  backfillContentDocuments,
  filterCompatibilityContent,
  filterDailyContent,
  filterMonthlyContent,
  filterPersonalityContent,
  filterWeeklyContent
} from '@/workers/content';
import {
  buildFallbackSubscriptionResponse,
  decodeWebhookPayload,
  extractSubscriptionNotification
} from '@/workers/subscription';
import { createTestEnv } from '../helpers/env';

describe('content filters', () => {
  it('returns only free fields for daily content', () => {
    const result = filterDailyContent(
      {
        short: 'Bugün enerjin yüksek.',
        full: 'Uzun premium yorum',
        love: 'Premium love',
        career: 'Premium career',
        money: 'Premium money',
        health: 'Premium health',
        lucky_number: 7,
        lucky_color: 'Kırmızı',
        energy: 85,
        love_score: 70,
        career_score: 90,
        money_score: 66,
        health_score: 74,
        daily_tip: 'Premium tip'
      },
      false
    );

    expect(result).toEqual({
      short: 'Bugün enerjin yüksek.',
      lucky_number: 7,
      lucky_color: 'Kırmızı',
      energy: 85,
      love_score: 70,
      career_score: 90,
      money_score: 66,
      health_score: 74
    });
  });

  it('returns premium fields untouched for daily content', () => {
    const source = {
      short: 'Bugün enerjin yüksek.',
      full: 'Uzun premium yorum',
      love: 'Premium love',
      career: 'Premium career',
      money: 'Premium money',
      health: 'Premium health',
      lucky_number: 7,
      lucky_color: 'Kırmızı',
      energy: 85,
      love_score: 70,
      career_score: 90,
      money_score: 66,
      health_score: 74,
      daily_tip: 'Premium tip'
    };

    expect(filterDailyContent(source, true)).toEqual(source);
  });

  it('applies free field slicing to weekly, monthly, compatibility and personality content', () => {
    expect(
      filterWeeklyContent(
        {
          summary: 'Weekly summary',
          love: 'love',
          career: 'career',
          money: 'money',
          best_day: 'Wednesday',
          warning: 'warning'
        },
        false
      )
    ).toEqual({ summary: 'Weekly summary' });

    expect(
      filterMonthlyContent(
        {
          summary: 'Monthly summary',
          love: 'love',
          career: 'career',
          money: 'money',
          best_day: 'Friday',
          warning: 'warning'
        },
        false
      )
    ).toEqual({ summary: 'Monthly summary' });

    expect(
      filterCompatibilityContent(
        {
          sign1: 'aries',
          sign2: 'leo',
          language: 'tr',
          overall_score: 87,
          love_score: 92,
          friendship_score: 80,
          work_score: 75,
          summary: 'Good match',
          strengths: ['a'],
          challenges: ['b'],
          advice: 'Premium advice',
          famous_couples: ['x']
        },
        false
      )
    ).toEqual({
      overall_score: 87,
      summary: 'Good match'
    });

    expect(
      filterPersonalityContent(
        {
          sign: 'aries',
          language: 'tr',
          title: 'Koç',
          summary: 'Short summary',
          deep_analysis: 'Premium analysis',
          strengths: ['bold'],
          weaknesses: ['impatient'],
          ideal_partners: ['leo'],
          career_fit: ['founder'],
          element: 'ateş',
          planet: 'Mars',
          color: 'Kırmızı',
          stone: 'Yakut'
        },
        false
      )
    ).toEqual({
      summary: 'Short summary',
      element: 'ateş',
      planet: 'Mars',
      color: 'Kırmızı',
      stone: 'Yakut'
    });
  });

  it('decodes wrapped play webhook payloads and extracts subscription details', () => {
    const encoded = Buffer.from(
      JSON.stringify({
        subscriptionNotification: {
          purchaseToken: 'purchase-token',
          subscriptionId: 'premium_monthly',
          notificationType: 4
        }
      }),
      'utf8'
    ).toString('base64');

    const decoded = decodeWebhookPayload({
      message: {
        data: encoded
      }
    });

    expect(extractSubscriptionNotification(decoded)).toEqual({
      purchaseToken: 'purchase-token',
      productId: 'premium_monthly',
      notificationType: 4
    });
  });

  it('creates a typed fallback subscription response for webhook-only updates', () => {
    expect(
      buildFallbackSubscriptionResponse('premium_yearly', 'purchase-token', '2026-03-18T09:00:00.000Z')
    ).toEqual({
      linkedPurchaseToken: 'purchase-token',
      startTime: '2026-03-18T09:00:00.000Z',
      lineItems: [
        {
          productId: 'premium_yearly',
          expiryTime: '2026-03-18T09:00:00.000Z'
        }
      ]
    });
  });

  it('uploads future content documents through the admin backfill route', async () => {
    const puts: string[] = [];
    const env = createTestEnv({
      CONTENT: {
        async head() {
          return { size: 1 } as R2Object;
        },
        async get() {
          return null;
        },
        async put(key: string) {
          puts.push(key);
        }
      } as unknown as R2Bucket
    });
    const app = createApp();

    const response = await app.request(
      '/api/v1/admin/content/backfill',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-secret': 'admin-secret'
        },
        body: JSON.stringify({
          seed_date: '2026-04-10',
          daily_days: 2,
          skip_static_content: true
        })
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      daily_days: 2,
      skip_static_content: true
    });
    expect(puts.some((key) => key.startsWith('content/daily/tr/2026-04-10'))).toBe(true);
    expect(puts.some((key) => key.startsWith('content/weekly/tr/'))).toBe(true);
    expect(puts.some((key) => key.startsWith('content/monthly/tr/'))).toBe(true);
  });

  it('uploads documents directly with worker bindings', async () => {
    const puts: string[] = [];
    const env = createTestEnv({
      CONTENT: {
        async head() {
          return { size: 1 } as R2Object;
        },
        async get() {
          return null;
        },
        async put(key: string) {
          puts.push(key);
        }
      } as unknown as R2Bucket
    });

    const uploads = await backfillContentDocuments(env, {
      seed_date: '2026-04-10',
      daily_days: 1,
      skip_static_content: true
    });

    expect(uploads).not.toHaveLength(0);
    expect(puts).toHaveLength(uploads.length);
  });

  it('fails before the first R2 write when generated content violates quality rules', async () => {
    const puts: string[] = [];
    const env = createTestEnv({
      CONTENT: {
        async head() {
          return { size: 1 } as R2Object;
        },
        async get() {
          return null;
        },
        async put(key: string) {
          puts.push(key);
        }
      } as unknown as R2Bucket
    });

    await expect(
      backfillContentDocuments(
        env,
        {
          seed_date: '2026-04-10',
          daily_days: 1,
          skip_static_content: true
        },
        () => [
          {
            key: 'content/daily/en/2026-04-10.json',
            payload: {
              signs: Object.fromEntries(
                Array.from({ length: 12 }, (_, index) => [
                  `sign-${index}`,
                  { short: 'Same generic sentence.' }
                ])
              )
            }
          }
        ]
      )
    ).rejects.toThrow(/unique daily summaries/i);
    expect(puts).toEqual([]);
  });

});
