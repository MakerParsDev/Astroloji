import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteFirebaseUserMock } = vi.hoisted(() => ({ deleteFirebaseUserMock: vi.fn() }));
vi.mock('@/services/firebaseAuth', async () => ({
  ...await vi.importActual<typeof import('@/services/firebaseAuth')>('@/services/firebaseAuth'),
  deleteFirebaseUser: deleteFirebaseUserMock
}));

import { reconcileAccountDeletions } from '@/workers/user';
import { createTestEnv } from '../helpers/env';

type DeletionJob = {
  user_id: string;
  firebase_uid: string;
  created_at: string;
  next_attempt_at: string;
  attempts: number;
};

function pendingDeletionDb(count: number, shouldFail: (userId: string, attempt: number) => boolean = () => false) {
  const createdAt = new Date('2026-10-10T10:00:00.000Z').getTime();
  const queued: DeletionJob[] = Array.from({ length: count }, (_, index) => ({
    user_id: `user-${index + 1}`,
    firebase_uid: `firebase-${index + 1}`,
    created_at: new Date(createdAt + index * 1000).toISOString(),
    next_attempt_at: new Date(createdAt + index * 1000).toISOString(),
    attempts: 0
  }));
  const completed: string[] = [];
  const attempted: string[] = [];
  const writes: string[] = [];
  const db = {
    prepare(sql: string) {
      const statement = {
        sql,
        bindings: [] as unknown[],
        bind(...values: unknown[]) { statement.bindings = values; return statement; },
        async all() {
          if (!sql.includes('FROM account_deletion_jobs')) throw new Error(`Unexpected query: ${sql}`);
          const [due, limit] = statement.bindings as [string, number];
          return {
            results: queued.filter((job) => job.next_attempt_at <= due)
              .sort((left, right) => left.next_attempt_at.localeCompare(right.next_attempt_at)
                || left.created_at.localeCompare(right.created_at))
              .slice(0, limit)
              .map((job) => ({ ...job }))
          };
        },
        async run() {
          writes.push(sql);
          if (!sql.startsWith('UPDATE account_deletion_jobs SET attempts')) throw new Error(`Unexpected update: ${sql}`);
          const [nextAttemptAt, userId] = statement.bindings as [string, string];
          const job = queued.find((item) => item.user_id === userId);
          if (!job) throw new Error('Missing pending job');
          job.attempts += 1;
          job.next_attempt_at = nextAttemptAt;
        }
      };
      return statement;
    },
    async batch(input: Array<{ sql: string; bindings: unknown[] }>) {
      const userDelete = input.find((entry) => entry.sql === 'DELETE FROM users WHERE id = ?');
      const userId = userDelete?.bindings[0] as string | undefined;
      if (!userId) throw new Error('Missing user deletion');
      attempted.push(userId);
      if (shouldFail(userId, attempted.filter((item) => item === userId).length)) {
        throw new Error('database interrupted');
      }
      if (!input.some((entry) => entry.sql === 'DELETE FROM account_deletion_jobs WHERE user_id = ?')) {
        throw new Error('Missing atomic intent cleanup');
      }
      queued.splice(queued.findIndex((job) => job.user_id === userId), 1);
      completed.push(userId);
      return input.map(() => ({ success: true }));
    }
  } as unknown as D1Database;
  return { db, queued, attempted, completed, writes };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-10T12:00:00.000Z'));
  deleteFirebaseUserMock.mockReset();
  deleteFirebaseUserMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('durable account deletion reconciliation', () => {
  it('retries a pending deletion without an application JWT and clears intent atomically', async () => {
    const { db, queued, completed } = pendingDeletionDb(1);
    const env = createTestEnv({ DB: db });
    await reconcileAccountDeletions(env);
    expect(deleteFirebaseUserMock).toHaveBeenCalledWith(env, 'firebase-1');
    expect(completed).toEqual(['user-1']);
    expect(queued).toHaveLength(0);
  });

  it('defers a failed D1 batch, then retries it when due without a JWT', async () => {
    const { db, queued, attempted } = pendingDeletionDb(1, (_user, attempt) => attempt === 1);
    const env = createTestEnv({ DB: db });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await reconcileAccountDeletions(env);
    expect(queued[0]).toMatchObject({ attempts: 1, next_attempt_at: '2026-10-10T13:00:00.000Z' });
    await reconcileAccountDeletions(env);
    expect(attempted).toEqual(['user-1']);
    vi.setSystemTime(new Date('2026-10-10T13:00:00.000Z'));
    await reconcileAccountDeletions(env);
    expect(attempted).toEqual(['user-1', 'user-1']);
    expect(queued).toHaveLength(0);
    expect(deleteFirebaseUserMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain('user-1');
  });

  it('lets newer jobs run when the 25 oldest jobs repeatedly fail', async () => {
    const { db, queued, completed, attempted } = pendingDeletionDb(26, (userId) => userId !== 'user-26');
    const env = createTestEnv({ DB: db });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await reconcileAccountDeletions(env);
    expect(attempted).toHaveLength(25);
    expect(queued.filter((job) => job.attempts === 1)).toHaveLength(25);
    await reconcileAccountDeletions(env);
    expect(completed).toEqual(['user-26']);
    expect(queued).toHaveLength(25);
    vi.setSystemTime(new Date('2026-10-10T13:00:00.000Z'));
    await reconcileAccountDeletions(env);
    expect(queued[0]).toMatchObject({ attempts: 2, next_attempt_at: '2026-10-10T15:00:00.000Z' });
    expect(attempted).toHaveLength(51);
    expect(JSON.stringify(log.mock.calls)).not.toContain('user-1');
  });

  it('caps delayed retry at twelve hours and never abandons the intent', async () => {
    const { db, queued, attempted } = pendingDeletionDb(1, () => true);
    const env = createTestEnv({ DB: db });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const hours of [1, 2, 4, 8, 12, 12]) {
      const now = Date.now();
      await reconcileAccountDeletions(env);
      expect(queued).toHaveLength(1);
      expect(new Date(queued[0].next_attempt_at).getTime() - now).toBe(hours * 60 * 60 * 1000);
      vi.setSystemTime(new Date(queued[0].next_attempt_at));
    }
    expect(attempted).toHaveLength(6);
    expect(queued[0].attempts).toBe(6);
  });
});
