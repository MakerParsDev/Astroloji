import { describe, expect, it } from 'vitest';

import { createApp } from '@/index';
import { signAppJwt } from '@/utils/jwt';
import { createTestEnv } from '../helpers/env';

interface UserRow {
  streak_count: number;
  last_streak_date: string | null;
  streak_milestone_claimed: number;
  utc_offset: number;
}

function createStreakDb(user: UserRow) {
  const ledger: { user_id: string; delta: number; reason: string }[] = [];

  const db = {
    prepare(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      const statement = {
        bindings: [] as unknown[],
        bind(...bindings: unknown[]) {
          statement.bindings = bindings;
          return statement;
        },
        async first() {
          if (normalized.startsWith('SELECT 1 AS ok FROM users')) {
            return { ok: 1 };
          }
          if (normalized.startsWith('SELECT streak_count, last_streak_date, streak_milestone_claimed, utc_offset')) {
            return { ...user };
          }
          if (normalized.startsWith('SELECT COALESCE(SUM(delta), 0) AS balance FROM credit_ledger')) {
            const userId = statement.bindings[0] as string;
            const balance = ledger.filter((row) => row.user_id === userId).reduce((sum, row) => sum + row.delta, 0);
            return { balance };
          }
          return null;
        },
        async run() {
          if (normalized.startsWith('UPDATE users SET streak_count = ?, last_streak_date = ?')) {
            const [streakCount, lastStreakDate] = statement.bindings as [number, string];
            user.streak_count = streakCount;
            user.last_streak_date = lastStreakDate;
          } else if (normalized.startsWith('UPDATE users SET streak_milestone_claimed = ?')) {
            const [milestone, , threshold] = statement.bindings as [number, string, number];
            if (user.streak_milestone_claimed < threshold) {
              user.streak_milestone_claimed = milestone;
              return { success: true, meta: { changes: 1 } };
            }
            return { success: true, meta: { changes: 0 } };
          } else if (normalized.startsWith('INSERT INTO credit_ledger')) {
            const [, userId, delta, reason] = statement.bindings as [string, string, number, string];
            ledger.push({ user_id: userId, delta, reason });
          }
          return { success: true, meta: { changes: 1 } };
        },
        async all() {
          return { results: [] };
        }
      };
      return statement;
    },
    async batch() {
      return [];
    }
  } as unknown as D1Database;

  return { db, ledger };
}

describe('streak worker', () => {
  it('starts a first-time streak with no reward', async () => {
    const { db } = createStreakDb({
      streak_count: 0,
      last_streak_date: null,
      streak_milestone_claimed: 0,
      utc_offset: 0
    });
    const env = createTestEnv({ DB: db });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });

    const response = await createApp().request(
      '/api/v1/streak/checkin',
      { method: 'POST', headers: { authorization: `Bearer ${jwt}` } },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      streak_count: 1,
      last_streak_date: expect.any(String),
      milestone_achieved: null,
      credits_granted: 0,
      balance: 0
    });
  });

  it('is idempotent when checking in twice on the same local day', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { db } = createStreakDb({
      streak_count: 5,
      last_streak_date: today,
      streak_milestone_claimed: 3,
      utc_offset: 0
    });
    const env = createTestEnv({ DB: db });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });

    const response = await createApp().request(
      '/api/v1/streak/checkin',
      { method: 'POST', headers: { authorization: `Bearer ${jwt}` } },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      streak_count: 5,
      last_streak_date: today,
      milestone_achieved: 3,
      credits_granted: 0,
      balance: 0
    });
  });

  it('rejects unauthenticated requests', async () => {
    const { db } = createStreakDb({
      streak_count: 0,
      last_streak_date: null,
      streak_milestone_claimed: 0,
      utc_offset: 0
    });
    const env = createTestEnv({ DB: db });

    const response = await createApp().request('/api/v1/streak/checkin', { method: 'POST' }, env);

    expect(response.status).toBe(401);
  });
});
