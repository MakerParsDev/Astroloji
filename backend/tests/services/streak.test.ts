import { describe, expect, it } from 'vitest';

import { checkInStreak } from '@/services/streak';

interface UserRow {
  streak_count: number;
  last_streak_date: string | null;
  streak_milestone_claimed: number;
  utc_offset: number;
}

function createFakeDb(user: UserRow) {
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
            const [streakCount, lastStreakDate] = statement.bindings as [number, string, string];
            user.streak_count = streakCount;
            user.last_streak_date = lastStreakDate;
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith('UPDATE users SET streak_milestone_claimed = ?')) {
            const [milestone, , threshold] = statement.bindings as [number, string, number];
            if (user.streak_milestone_claimed < threshold) {
              user.streak_milestone_claimed = milestone;
              return { success: true, meta: { changes: 1 } };
            }
            return { success: true, meta: { changes: 0 } };
          }
          if (normalized.startsWith('INSERT INTO credit_ledger')) {
            const [, userId, delta] = statement.bindings as [string, string, number];
            ledger.push({ user_id: userId, delta, reason: 'streak_reward' });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: {} };
        },
        async all() {
          return { results: [] };
        }
      };

      return statement;
    }
  };

  return { db: db as unknown as D1Database, ledger };
}

describe('checkInStreak', () => {
  it('starts a first-time streak with no reward', async () => {
    const { db, ledger } = createFakeDb({
      streak_count: 0,
      last_streak_date: null,
      streak_milestone_claimed: 0,
      utc_offset: 0
    });

    const result = await checkInStreak(db, 'user-1', 'ledger-1', new Date('2026-08-11T12:00:00Z'));

    expect(result.streakCount).toBe(1);
    expect(result.milestoneAchieved).toBeNull();
    expect(result.creditsGranted).toBe(0);
    expect(ledger).toHaveLength(0);
  });

  it('grants credits the first time a milestone is crossed', async () => {
    const { db, ledger } = createFakeDb({
      streak_count: 2,
      last_streak_date: '2026-08-10',
      streak_milestone_claimed: 0,
      utc_offset: 0
    });

    const result = await checkInStreak(db, 'user-1', 'ledger-1', new Date('2026-08-11T12:00:00Z'));

    expect(result.streakCount).toBe(3);
    expect(result.milestoneAchieved).toBe(3);
    expect(result.creditsGranted).toBe(5);
    expect(result.balance).toBe(5);
    expect(ledger).toEqual([{ user_id: 'user-1', delta: 5, reason: 'streak_reward' }]);
  });

  it('does not re-grant a milestone that was already claimed', async () => {
    const { db, ledger } = createFakeDb({
      streak_count: 3,
      last_streak_date: '2026-08-11',
      streak_milestone_claimed: 3,
      utc_offset: 0
    });

    const result = await checkInStreak(db, 'user-1', 'ledger-1', new Date('2026-08-11T18:00:00Z'));

    expect(result.streakCount).toBe(3);
    expect(result.milestoneAchieved).toBe(3);
    expect(result.creditsGranted).toBe(0);
    expect(ledger).toHaveLength(0);
  });

  it('resets the streak after a missed day', async () => {
    const { db } = createFakeDb({
      streak_count: 10,
      last_streak_date: '2026-08-01',
      streak_milestone_claimed: 7,
      utc_offset: 0
    });

    const result = await checkInStreak(db, 'user-1', 'ledger-1', new Date('2026-08-11T12:00:00Z'));

    expect(result.streakCount).toBe(1);
    expect(result.milestoneAchieved).toBeNull();
  });

  it('resolves the check-in day using the user utc offset', async () => {
    const { db } = createFakeDb({
      streak_count: 1,
      last_streak_date: '2026-08-11',
      streak_milestone_claimed: 0,
      utc_offset: 5
    });

    const result = await checkInStreak(db, 'user-1', 'ledger-1', new Date('2026-08-11T20:00:00Z'));

    expect(result.lastStreakDate).toBe('2026-08-12');
    expect(result.streakCount).toBe(2);
  });
});
