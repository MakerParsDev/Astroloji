import { describe, expect, it } from 'vitest';

import { createApp } from '@/index';
import { signAppJwt } from '@/utils/jwt';
import { createTestEnv } from '../helpers/env';

function createEntitlementDb(hasEntitlement: boolean): D1Database {
  return {
    prepare(sql: string) {
      const statement = {
        bind() {
          return statement;
        },
        async first() {
          if (sql.includes('SELECT 1 AS ok FROM users')) return { ok: 1 };
          if (sql.includes('FROM reward_challenges') && hasEntitlement) {
            return { id: 'challenge-1' };
          }
          return null;
        },
        async all() {
          return { results: [] };
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
  } as unknown as D1Database;
}

function createDailyContent(): R2Bucket {
  return {
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
  } as unknown as R2Bucket;
}

describe('reward unlock routes', () => {
  it('unlocks full daily content only from a consumed D1 entitlement', async () => {
    const env = createTestEnv({
      DB: createEntitlementDb(true),
      CONTENT: createDailyContent()
    });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });

    const response = await createApp().request(
      '/api/v1/content/daily?sign=aries&lang=tr&date=2026-04-10',
      { headers: { authorization: `Bearer ${jwt}` } },
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

  it('keeps premium fields locked without a consumed D1 entitlement', async () => {
    const env = createTestEnv({
      DB: createEntitlementDb(false),
      CONTENT: createDailyContent()
    });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });

    const response = await createApp().request(
      '/api/v1/content/daily?sign=aries&lang=tr&date=2026-04-10',
      { headers: { authorization: `Bearer ${jwt}` } },
      env
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.short).toBe('Kisa yorum');
    expect(body.full).toBeUndefined();
    expect(body.love).toBeUndefined();
    expect(body.daily_tip).toBeUndefined();
  });
});
