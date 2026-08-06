import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSubscriptionStatusMock, verifySubscriptionPurchaseMock } = vi.hoisted(() => ({
  getSubscriptionStatusMock: vi.fn(),
  verifySubscriptionPurchaseMock: vi.fn()
}));

vi.mock('@/services/playBilling', async () => {
  const actual = await vi.importActual<typeof import('@/services/playBilling')>(
    '@/services/playBilling'
  );
  return {
    ...actual,
    getSubscriptionStatus: getSubscriptionStatusMock,
    verifySubscriptionPurchase: verifySubscriptionPurchaseMock
  };
});

import { createApp } from '@/index';
import type { GooglePlaySubscription } from '@/types';
import { signAppJwt } from '@/utils/jwt';
import { createTestEnv } from '../helpers/env';

interface RecordingDbOptions {
  pendingRows?: Array<{ purchase_token: string; user_id: string }>;
  subscriptionOwner?: string | null;
}

function createRecordingDb(options: RecordingDbOptions = {}) {
  const writes: Array<{ sql: string; bindings: unknown[] }> = [];
  const reads: Array<{ sql: string; bindings: unknown[] }> = [];

  return {
    writes,
    reads,
    db: {
      prepare(sql: string) {
        let bindings: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) {
            bindings = values;
            return statement;
          },
          async first() {
            reads.push({ sql, bindings });
            if (sql.includes('SELECT 1 AS ok FROM users')) {
              return { ok: 1 };
            }
            if (sql.includes('SELECT user_id FROM subscriptions')) {
              const owner = options.subscriptionOwner === undefined ? 'user-1' : options.subscriptionOwner;
              return owner ? { user_id: owner } : null;
            }
            return null;
          },
          async all() {
            reads.push({ sql, bindings });
            if (sql.includes('SELECT DISTINCT purchase_token')) {
              return { results: options.pendingRows ?? [] };
            }
            return { results: [] };
          },
          async run() {
            writes.push({ sql, bindings });
            return { success: true, meta: {} };
          }
        };
        return statement;
      },
      async batch() {
        return [];
      }
    } as unknown as D1Database
  };
}

function activeWeeklySubscription(
  purchaseToken = 'weekly-purchase-token'
): GooglePlaySubscription {
  return {
    purchaseToken,
    productId: 'premium_weekly',
    status: 'active',
    startsAt: '2026-08-06T10:00:00.000Z',
    expiresAt: '2026-08-13T10:00:00.000Z',
    autoRenewing: true,
    cancelReason: null,
    raw: {
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      lineItems: [
        {
          productId: 'premium_weekly',
          expiryTime: '2026-08-13T10:00:00.000Z',
          autoRenewingPlan: {}
        }
      ]
    }
  };
}

async function authenticatedSubscriptionRequest(
  path: '/api/v1/subscriptions/verify' | '/api/v1/subscriptions/restore',
  event: 'purchased' | 'renewed'
) {
  const { db, writes } = createRecordingDb();
  const env = createTestEnv({
    DB: db,
    PACKAGE_NAME: 'com.parsfilo.astrology'
  });
  const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });
  verifySubscriptionPurchaseMock.mockResolvedValue(activeWeeklySubscription());

  const response = await createApp().request(
    path,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${jwt}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        purchase_token: 'weekly-purchase-token',
        product_id: 'premium_weekly'
      })
    },
    env
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    is_premium: true,
    subscription_state: 'active',
    product_id: 'premium_weekly'
  });
  expect(verifySubscriptionPurchaseMock).toHaveBeenCalledWith(
    env,
    'weekly-purchase-token',
    'premium_weekly',
    'com.parsfilo.astrology'
  );
  expect(writes.some((write) => write.bindings.includes('premium_weekly'))).toBe(true);
  expect(writes.some((write) => write.bindings.includes(event))).toBe(true);
}

describe('subscription worker', () => {
  beforeEach(() => {
    getSubscriptionStatusMock.mockReset();
    verifySubscriptionPurchaseMock.mockReset();
  });

  it('accepts RTDN query token auth and marks reconciliation pending when live state is unavailable', async () => {
    getSubscriptionStatusMock.mockResolvedValue(null);
    const { db, writes } = createRecordingDb();
    const app = createApp();

    const response = await app.request(
      '/api/v1/webhooks/play-rtdn?token=play-secret',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          subscriptionNotification: {
            purchaseToken: 'purchase-token',
            subscriptionId: 'premium_monthly',
            notificationType: 4
          }
        })
      },
      createTestEnv({ DB: db })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      reconciliation: 'pending'
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]?.bindings[3]).toBe('sync_pending');
  });

  it('keeps legacy x-play-secret auth working during migration', async () => {
    getSubscriptionStatusMock.mockResolvedValue(null);
    const { db } = createRecordingDb();
    const app = createApp();

    const response = await app.request(
      '/api/v1/webhooks/play-rtdn',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-play-secret': 'play-secret'
        },
        body: JSON.stringify({
          subscriptionNotification: {
            purchaseToken: 'purchase-token',
            subscriptionId: 'premium_monthly',
            notificationType: 4
          }
        })
      },
      createTestEnv({ DB: db })
    );

    expect(response.status).toBe(200);
  });

  it('passes weekly RTDN product details to Google Play lookup', async () => {
    getSubscriptionStatusMock.mockResolvedValue(null);
    const { db } = createRecordingDb();
    const env = createTestEnv({
      DB: db,
      PACKAGE_NAME: 'com.parsfilo.astrology'
    });

    const response = await createApp().request(
      '/api/v1/webhooks/play-rtdn?token=play-secret',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subscriptionNotification: {
            purchaseToken: 'weekly-purchase-token',
            subscriptionId: 'premium_weekly',
            notificationType: 4
          }
        })
      },
      env
    );

    expect(response.status).toBe(200);
    expect(getSubscriptionStatusMock).toHaveBeenCalledWith(
      env,
      'weekly-purchase-token',
      'premium_weekly',
      'com.parsfilo.astrology'
    );
  });

  it('verifies and persists weekly subscriptions', async () => {
    await authenticatedSubscriptionRequest('/api/v1/subscriptions/verify', 'purchased');
  });

  it('restores and persists weekly subscriptions', async () => {
    await authenticatedSubscriptionRequest('/api/v1/subscriptions/restore', 'renewed');
  });

  it('falls back from monthly to weekly during pending reconciliation audit', async () => {
    const { db, writes } = createRecordingDb({
      pendingRows: [{ purchase_token: 'weekly-purchase-token', user_id: 'user-1' }]
    });
    const env = createTestEnv({
      DB: db,
      PACKAGE_NAME: 'com.parsfilo.astrology'
    });
    getSubscriptionStatusMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(activeWeeklySubscription());

    const response = await createApp().request(
      '/api/v1/admin/subscriptions/audit',
      {
        headers: { 'x-admin-secret': 'admin-secret' }
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      audited: 1,
      results: [{ user_id: 'user-1', status: 'active' }]
    });
    expect(getSubscriptionStatusMock).toHaveBeenNthCalledWith(
      1,
      env,
      'weekly-purchase-token',
      'premium_monthly',
      'com.parsfilo.astrology'
    );
    expect(getSubscriptionStatusMock).toHaveBeenNthCalledWith(
      2,
      env,
      'weekly-purchase-token',
      'premium_weekly',
      'com.parsfilo.astrology'
    );
    expect(writes.some((write) => write.bindings.includes('premium_weekly'))).toBe(true);
  });
});
