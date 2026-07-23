import { describe, expect, it, vi } from 'vitest';

const { createGoogleAccessTokenMock } = vi.hoisted(() => ({
  createGoogleAccessTokenMock: vi.fn()
}));

vi.mock('@/utils/jwt', async () => {
  const actual = await vi.importActual<typeof import('@/utils/jwt')>('@/utils/jwt');
  return {
    ...actual,
    createGoogleAccessToken: createGoogleAccessTokenMock
  };
});

import { createApp } from '@/index';
import { signAppJwt } from '@/utils/jwt';
import { createTestEnv } from '../helpers/env';

function createJsonR2(document: unknown) {
  return {
    async head() {
      return { size: JSON.stringify(document).length } as R2Object;
    },
    async get() {
      return {
        async json() {
          return document;
        }
      } as R2ObjectBody;
    }
  } as unknown as R2Bucket;
}

describe('monetization routes', () => {
  it('claims a daily reward once per user and content period', async () => {
    const rewardClaims = new Map<string, string>();
    const env = createTestEnv({
      CACHE: {
        async get(key: string) {
          return rewardClaims.get(key) ?? null;
        },
        async put(key: string, value: string) {
          rewardClaims.set(key, value);
        },
        async delete(key: string) {
          rewardClaims.delete(key);
        }
      } as unknown as KVNamespace
    });
    const jwt = await signAppJwt(env, {
      userId: 'user-1',
      isPremium: false,
      firebaseUid: 'firebase-1'
    });
    const app = createApp();

    const firstResponse = await app.request(
      '/api/v1/rewards/claim',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${jwt}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          reward_type: 'daily',
          identifier: '2026-04-10'
        })
      },
      env
    );

    expect(firstResponse.status).toBe(200);
    await expect(firstResponse.json()).resolves.toEqual({
      ok: true,
      reward_type: 'daily',
      identifier: '2026-04-10'
    });

    const duplicateResponse = await app.request(
      '/api/v1/rewards/claim',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${jwt}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          reward_type: 'daily',
          identifier: '2026-04-10'
        })
      },
      env
    );

    expect(duplicateResponse.status).toBe(409);
  });

  it('unlocks daily premium fields when a valid reward claim exists', async () => {
    const rewardClaims = new Map<string, string>([['reward:user-1:daily:2026-04-10', '1']]);
    const env = createTestEnv({
      CACHE: {
        async get(key: string) {
          return rewardClaims.get(key) ?? null;
        },
        async put(key: string, value: string) {
          rewardClaims.set(key, value);
        },
        async delete(key: string) {
          rewardClaims.delete(key);
        }
      } as unknown as KVNamespace,
      CONTENT: createJsonR2({
        date: '2026-04-10',
        language: 'tr',
        signs: {
          aries: {
            short: 'Kisa yorum',
            full: 'Tam premium yorum',
            love: 'Ask',
            career: 'Kariyer',
            money: 'Para',
            health: 'Saglik',
            lucky_number: 7,
            lucky_color: 'Mavi',
            energy: 91,
            love_score: 70,
            career_score: 68,
            money_score: 66,
            health_score: 75,
            daily_tip: 'Tip'
          }
        }
      })
    });
    const jwt = await signAppJwt(env, {
      userId: 'user-1',
      isPremium: false,
      firebaseUid: 'firebase-1'
    });
    const app = createApp();

    const response = await app.request(
      '/api/v1/content/daily?sign=aries&lang=tr&date=2026-04-10',
      {
        headers: {
          authorization: `Bearer ${jwt}`
        }
      },
      env
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      full: string;
      money: string;
      health: string;
    };
    expect(body.full).toBe('Tam premium yorum');
    expect(body.money).toBe('Para');
    expect(body.health).toBe('Saglik');
  });

  it('keeps Play subscription patch routes in preview mode until apply is true', async () => {
    createGoogleAccessTokenMock.mockResolvedValue('google-access-token');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            subscriptions: [{ productId: 'premium_monthly' }]
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      );
    const env = createTestEnv();
    const app = createApp();

    const response = await app.request(
      '/api/v1/admin/play/subscriptions/premium_monthly',
      {
        method: 'PATCH',
        headers: {
          'x-admin-secret': 'admin-secret',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          package_name: 'com.example.astrology',
          regions: [{ region_code: 'TR', currency_code: 'TRY', price_micros: '149000000' }]
        })
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      dry_run: true,
      product_id: 'premium_monthly'
    });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });
});
