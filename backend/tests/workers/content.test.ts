import { describe, expect, it, vi } from 'vitest';

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
import { signAppJwt } from '@/utils/jwt';
import { createRateLimiterNamespace, createTestEnv } from '../helpers/env';

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
      buildFallbackSubscriptionResponse('premium_weekly', 'purchase-token', '2026-03-18T09:00:00.000Z')
    ).toEqual({
      linkedPurchaseToken: 'purchase-token',
      startTime: '2026-03-18T09:00:00.000Z',
      lineItems: [
        {
          productId: 'premium_weekly',
          expiryTime: '2026-03-18T09:00:00.000Z'
        }
      ]
    });
  });

  it('rejects content backfill without explicit editorial approval before R2 writes', async () => {
    const puts: string[] = [];
    const env = createTestEnv({
      CONTENT: {
        async head() { return { size: 1 } as R2Object; },
        async get() { return null; },
        async put(key: string) { puts.push(key); }
      } as unknown as R2Bucket
    });

    const response = await createApp().request(
      '/api/v1/admin/content/backfill',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-secret': 'content-secret'
        },
        body: JSON.stringify({
          seed_date: '2026-04-10',
          daily_days: 1,
          skip_static_content: true
        })
      },
      env
    );

    expect(response.status).toBe(400);
    expect(puts).toEqual([]);
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
          'x-admin-secret': 'content-secret'
        },
        body: JSON.stringify({
          seed_date: '2026-04-10',
          daily_days: 2,
          skip_static_content: true,
          editorial_status: 'approved',
          approved_by: 'test-editor',
          approval_reference: 'test:content-backfill'
        })
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      daily_days: 2,
      skip_static_content: true,
      editorial_status: 'approved',
      approved_by: 'test-editor',
      approval_reference: 'test:content-backfill'
    });
    expect(puts.some((key) => key.startsWith('content/daily/tr/2026-04-10'))).toBe(true);
    expect(puts.some((key) => key.startsWith('content/weekly/tr/'))).toBe(true);
    expect(puts.some((key) => key.startsWith('content/monthly/tr/'))).toBe(true);
  });

  it('uploads documents directly with worker bindings', async () => {
    const puts: Array<{ key: string; payload: Record<string, unknown> }> = [];
    const env = createTestEnv({
      CONTENT: {
        async head() {
          return { size: 1 } as R2Object;
        },
        async get() {
          return null;
        },
        async put(key: string, value: string | ReadableStream | ArrayBuffer | ArrayBufferView) {
          puts.push({ key, payload: JSON.parse(String(value)) as Record<string, unknown> });
        }
      } as unknown as R2Bucket
    });

    const uploads = await backfillContentDocuments(env, {
      seed_date: '2026-04-10',
      daily_days: 1,
      skip_static_content: true,
      editorial_status: 'approved',
      approved_by: 'test-editor',
      approval_reference: 'test:content-backfill'
    });

    expect(uploads).not.toHaveLength(0);
    expect(puts).toHaveLength(uploads.length);
    expect(puts.every(({ payload }) =>
      payload.editorial_status === 'approved' &&
      payload.approved_by === 'test-editor' &&
      payload.approval_reference === 'test:content-backfill' &&
      typeof payload.approved_at === 'string'
    )).toBe(true);
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
          skip_static_content: true,
          editorial_status: 'approved',
          approved_by: 'test-editor',
          approval_reference: 'test:content-backfill'
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


describe('content strict rate limiting', () => {
  it.each([
    ['denied', async () => ({ allowed: false, remaining: 0, retryAfterSeconds: 11 }), 429, 'RATE_LIMITED'],
    ['unavailable', async () => { throw new Error('rate limiter unavailable'); }, 503, 'RATE_LIMIT_UNAVAILABLE']
  ])('fails closed before R2 content work when limiter is %s', async (_name, check, status, code) => {
    let r2Reads = 0;
    const limiterCheck = vi.fn(check);
    const env = createTestEnv({
      RATE_LIMITER: createRateLimiterNamespace(limiterCheck),
      CONTENT: {
        async head() { return null; },
        async get() { r2Reads += 1; return null; }
      } as unknown as R2Bucket
    });
    const jwt = await signAppJwt(env, { userId: 'content-user', isPremium: false });
    const response = await createApp().request(
      '/api/v1/content/daily?sign=aries&lang=tr&date=2026-08-08',
      { headers: { authorization: `Bearer ${jwt}` } },
      env
    );
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
    expect(limiterCheck).toHaveBeenCalledTimes(1);
    expect(r2Reads).toBe(0);
  });
});
