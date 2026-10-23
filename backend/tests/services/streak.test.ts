import { describe, expect, it } from 'vitest';

import { checkInStreak } from '@/services/streak';

interface UserRow {
  streak_count: number;
  last_streak_date: string | null;
  streak_milestone_claimed: number;
  utc_offset: number;
}

function createFakeDb(user: UserRow) {
  let failLedgerInsert = false;
  let batchTail: Promise<void> = Promise.resolve();
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
          if (normalized.startsWith('INSERT INTO credit_ledger')) {
            if (failLedgerInsert) throw new Error('Injected credit ledger failure');
            const [, userId, delta, , , , threshold] = statement.bindings as [string, string, number, string, string, string, number];
            if (user.streak_milestone_claimed >= threshold) return { success: true, meta: { changes: 0 } };
            ledger.push({ user_id: userId, delta, reason: 'streak_reward' });
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
          return { success: true, meta: {} };
        },
        async all() {
          return { results: [] };
        }
      };

      return statement;
    },
    async batch(statements: Array<{ run(): Promise<{ meta: { changes?: number } }> }>) {
      // Match D1: concurrent batches are isolated and executed serially.
      const previous = batchTail;
      let release!: () => void;
      batchTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      const oldClaimed = user.streak_milestone_claimed;
      const oldLedgerLength = ledger.length;
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        return results;
      } catch (error) {
        user.streak_milestone_claimed = oldClaimed;
        ledger.length = oldLedgerLength;
        throw error;
      } finally {
        release();
      }
    }
  };

  return { db: db as unknown as D1Database, ledger, setFailLedgerInsert: (fail: boolean) => { failLedgerInsert = fail; } };
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

  it('does not consume a milestone when its ledger insert fails, then grants on retry', async () => {
    const user = { streak_count: 2, last_streak_date: '2026-08-10', streak_milestone_claimed: 0, utc_offset: 0 };
    const { db, ledger, setFailLedgerInsert } = createFakeDb(user);
    setFailLedgerInsert(true);
    await expect(checkInStreak(db, 'user-1', 'ledger-1', new Date('2026-08-11T12:00:00Z')))
      .rejects.toThrow('Injected credit ledger failure');
    expect(user.streak_milestone_claimed).toBe(0);
    expect(ledger).toHaveLength(0);

    setFailLedgerInsert(false);
    const retry = await checkInStreak(db, 'user-1', 'ledger-2', new Date('2026-08-11T12:01:00Z'));
    expect(retry.creditsGranted).toBe(5);
    expect(user.streak_milestone_claimed).toBe(3);
    expect(ledger).toHaveLength(1);
  });

  it('grants only once when two requests use the same stale pre-claim state', async () => {
    const { db, ledger } = createFakeDb({
      streak_count: 2, last_streak_date: '2026-08-10', streak_milestone_claimed: 0, utc_offset: 0
    });
    const [a, b] = await Promise.all([
      checkInStreak(db, 'user-1', 'ledger-a', new Date('2026-08-11T12:00:00Z')),
      checkInStreak(db, 'user-1', 'ledger-b', new Date('2026-08-11T12:00:00Z'))
    ]);
    expect(a.creditsGranted + b.creditsGranted).toBe(5);
    expect(ledger).toHaveLength(1);
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
