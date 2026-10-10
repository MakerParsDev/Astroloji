import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteFirebaseUserMock } = vi.hoisted(() => ({ deleteFirebaseUserMock: vi.fn() }));
vi.mock('@/services/firebaseAuth', async () => ({
  ...await vi.importActual<typeof import('@/services/firebaseAuth')>('@/services/firebaseAuth'),
  deleteFirebaseUser: deleteFirebaseUserMock
}));

import { reconcileAccountDeletions } from '@/workers/user';
import { createTestEnv } from '../helpers/env';

function pendingDeletionDb(shouldFailFirstBatch = false) {
  const queued = [{ user_id: 'user-1', firebase_uid: 'firebase-1' }];
  const statements: string[] = [];
  let attempts = 0;
  const db = {
    prepare(sql: string) {
      const statement = {
        sql,
        bind() { return statement; },
        async all() {
          return { results: sql.includes('FROM account_deletion_jobs') ? [...queued] : [] };
        }
      };
      return statement;
    },
    async batch(input: Array<{ sql: string }>) {
      attempts += 1;
      if (shouldFailFirstBatch && attempts === 1) throw new Error('database interrupted');
      statements.push(...input.map((entry) => entry.sql));
      queued.splice(0);
      return input.map(() => ({ success: true }));
    }
  } as unknown as D1Database;
  return { db, queued, statements, attempts: () => attempts };
}

beforeEach(() => {
  deleteFirebaseUserMock.mockReset();
  deleteFirebaseUserMock.mockResolvedValue(undefined);
});

describe('durable account deletion reconciliation', () => {
  it('retries a pending deletion without an application JWT and clears intent atomically', async () => {
    const { db, queued, statements } = pendingDeletionDb();
    const env = createTestEnv({ DB: db });
    await reconcileAccountDeletions(env);
    expect(deleteFirebaseUserMock).toHaveBeenCalledWith(env, 'firebase-1');
    expect(statements).toContain('DELETE FROM users WHERE id = ?');
    expect(statements).toContain('DELETE FROM account_deletion_jobs WHERE user_id = ?');
    expect(queued).toHaveLength(0);
  });

  it('retains its intent on final D1 failure and succeeds during the next Cron', async () => {
    const { db, queued, attempts } = pendingDeletionDb(true);
    const env = createTestEnv({ DB: db });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await reconcileAccountDeletions(env);
      expect(queued).toHaveLength(1);
      await reconcileAccountDeletions(env);
      expect(queued).toHaveLength(0);
      expect(attempts()).toBe(2);
      expect(deleteFirebaseUserMock).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(log.mock.calls)).not.toContain('user-1');
    } finally {
      log.mockRestore();
    }
  });
});
