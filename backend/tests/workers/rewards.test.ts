import { describe, expect, it } from 'vitest';

import { createApp } from '@/index';
import { signAppJwt } from '@/utils/jwt';
import { createTestEnv } from '../helpers/env';

function createRewardCache() {
  const store = new Map<string, string>();
  return {
    async get(key: string, type?: string) {
      const value = store.get(key) ?? null;
      if (type === 'json' && value) {
        return JSON.parse(value);
      }
      return value;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    }
  } as unknown as KVNamespace;
}

describe('reward unlock routes', () => {
  it('allows one reward claim per user and content period', async () => {
    const cache = createRewardCache();
    const env = createTestEnv({ CACHE: cache });
    const app = createApp();
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });

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

    const secondResponse = await app.request(
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
    expect(secondResponse.status).toBe(409);
  });

  it('unlocks full daily content when a reward claim exists for that date', async () => {
    const cache = createRewardCache();
    const env = createTestEnv({
      CACHE: cache,
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
                    short: 'Kisa yorum',
                    full: 'Tam gunluk yorum',
                    love: 'Ask',
                    career: 'Kariyer',
                    money: 'Para',
                    health: 'Saglik',
                    lucky_number: 7,
                    lucky_color: 'Mavi',
                    energy: 88,
                    love_score: 76,
                    career_score: 81,
                    money_score: 66,
                    health_score: 70,
                    daily_tip: 'Su ic'
                  }
                }
              };
            }
          } as R2ObjectBody;
        }
      } as unknown as R2Bucket
    });
    const app = createApp();
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });
    const cacheNamespace = env.CACHE as unknown as KVNamespace;
    await cacheNamespace.put('reward:user-1:daily:2026-04-10', '1');

    const response = await app.request(
      '/api/v1/content/daily?sign=aries&lang=tr&date=2026-04-10',
      {
        method: 'GET',
        headers: {
          authorization: `Bearer ${jwt}`
        }
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      short: 'Kisa yorum',
      full: 'Tam gunluk yorum',
      love: 'Ask',
      money: 'Para',
      health: 'Saglik',
      daily_tip: 'Su ic'
    });
  });
});
