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
import { createTestEnv } from '../helpers/env';

function createRecordingDb() {
  const writes: Array<{ sql: string; bindings: unknown[] }> = [];

  return {
    writes,
    db: {
      prepare(sql: string) {
        return {
          bind(...bindings: unknown[]) {
            return {
              async first() {
                if (sql.includes('SELECT user_id FROM subscriptions')) {
                  return { user_id: 'user-1' };
                }
                return null;
              },
              async all() {
                return { results: [] };
              },
              async run() {
                writes.push({ sql, bindings });
                return { success: true, meta: {} };
              }
            };
          }
        };
      },
      async batch() {
        return [];
      }
    } as unknown as D1Database
  };
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
});
