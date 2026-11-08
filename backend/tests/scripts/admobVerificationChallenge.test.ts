import { describe, expect, it, vi } from 'vitest';

import {
  createSuppliedVerificationChallengeValues,
  executeVerificationChallengeCommand,
  validateSuppliedVerificationValues
} from '../../scripts/create-admob-verification-challenge';

const challengeId = '22222222-2222-4222-8222-222222222222';
const userId = 'admob-verify-11111111-1111-4111-8111-111111111111';

describe('supplied AdMob verification values', () => {
  it('validates the exact namespace and UUID formats', () => {
    expect(validateSuppliedVerificationValues(userId, challengeId)).toEqual({
      userId,
      challengeId
    });

    expect(() => validateSuppliedVerificationValues('user', challengeId)).toThrow(/User ID/);
    expect(() => validateSuppliedVerificationValues(userId, 'not-a-uuid')).toThrow(/Custom data/);
    expect(() =>
      validateSuppliedVerificationValues('admob-verify-not-a-uuid', challengeId)
    ).toThrow(/User ID/);
  });

  it('creates a deterministic fifteen-minute challenge from supplied values', () => {
    expect(
      createSuppliedVerificationChallengeValues({
        userId,
        challengeId,
        now: new Date('2026-07-27T10:00:00.000Z')
      })
    ).toEqual({
      challengeId,
      userId,
      identifier: 'admob-ssv-verification',
      createdAt: '2026-07-27T10:00:00.000Z',
      expiresAt: '2026-07-27T10:15:00.000Z'
    });
  });
});

describe('verification challenge command execution', () => {
  it('fails closed instead of claiming a challenge was created when D1 rejects the insert', () => {
    const runSql = vi.fn().mockReturnValue([{ success: false, results: [] }]);
    const log = vi.fn();
    expect(() =>
      executeVerificationChallengeCommand({
        command: 'create',
        env: { ADMOB_SSV_TEST_USER_ID: userId, ADMOB_SSV_TEST_CUSTOM_DATA: challengeId },
        runSql,
        log
      })
    ).toThrow(/D1 mutation failed/i);
    expect(runSql).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();
  });

  it('rejects an empty D1 response instead of claiming challenge creation', () => {
    const runSql = vi.fn().mockReturnValue([]);
    const log = vi.fn();
    expect(() =>
      executeVerificationChallengeCommand({
        command: 'create',
        env: { ADMOB_SSV_TEST_USER_ID: userId, ADMOB_SSV_TEST_CUSTOM_DATA: challengeId },
        runSql,
        log
      })
    ).toThrow(/D1 mutation failed/i);
    expect(log).not.toHaveBeenCalled();
  });

  it('does not claim successful creation without a matching D1 challenge readback', () => {
    const runSql = vi.fn()
      .mockReturnValueOnce([{ success: true, meta: { changes: 2 } }])
      .mockReturnValueOnce([{ success: true, results: [] }]);
    const log = vi.fn();

    expect(() =>
      executeVerificationChallengeCommand({
        command: 'create',
        env: { ADMOB_SSV_TEST_USER_ID: userId, ADMOB_SSV_TEST_CUSTOM_DATA: challengeId },
        now: new Date('2026-07-27T10:00:00.000Z'),
        runSql,
        log
      })
    ).toThrow(/readback|not confirmed/i);
    expect(runSql).toHaveBeenCalledTimes(2);
    expect(log).not.toHaveBeenCalled();
  });

  it('never accepts verification status from a failed D1 read', () => {
    const runSql = vi.fn().mockReturnValue([{
      success: false,
      results: [{ id: challengeId, user_id: userId, status: 'verified',
        transaction_id: null, expires_at: '2026-07-27T10:15:00Z' }]
    }]);
    const log = vi.fn();
    expect(() =>
      executeVerificationChallengeCommand({
        command: 'inspect',
        env: { ADMOB_SSV_TEST_USER_ID: userId, ADMOB_SSV_TEST_CUSTOM_DATA: challengeId },
        runSql,
        log
      })
    ).toThrow(/D1 query failed/i);
    expect(log).not.toHaveBeenCalled();
  });

  it('does not claim verified cleanup after a failed D1 delete, even when a read reports zero rows', () => {
    const runSql = vi.fn()
      .mockReturnValueOnce([{ success: false, results: [] }])
      .mockReturnValueOnce([{ success: true, results: [{ challenge_count: 0, user_count: 0 }] }]);
    const log = vi.fn();
    expect(() =>
      executeVerificationChallengeCommand({
        command: 'delete',
        env: { ADMOB_SSV_TEST_USER_ID: userId, ADMOB_SSV_TEST_CUSTOM_DATA: challengeId },
        runSql,
        log
      })
    ).toThrow(/D1 mutation failed/i);
    expect(log).not.toHaveBeenCalled();
  });

  it('creates the supplied challenge and logs only redacted evidence', () => {
    const runSql = vi.fn()
      .mockReturnValueOnce([{ success: true, meta: { changes: 1 } }])
      .mockReturnValueOnce([{
        success: true,
        results: [{
          id: challengeId,
          user_id: userId,
          status: 'pending',
          transaction_id: null,
          expires_at: '2026-07-27T10:15:00.000Z'
        }]
      }]);
    const log = vi.fn();

    const evidence = executeVerificationChallengeCommand({
      command: 'create',
      env: {
        ADMOB_SSV_TEST_USER_ID: userId,
        ADMOB_SSV_TEST_CUSTOM_DATA: challengeId
      },
      now: new Date('2026-07-27T10:00:00.000Z'),
      runSql,
      log
    });

    expect(runSql).toHaveBeenCalledTimes(2);
    expect(runSql.mock.calls[1]?.[0]).toContain(`id = '${challengeId}'`);
    expect(runSql.mock.calls[1]?.[0]).toContain(`user_id = '${userId}'`);
    const sql = runSql.mock.calls[0]?.[0] as string;
    expect(sql).toContain('INSERT INTO users');
    expect(sql).not.toContain('INSERT OR IGNORE INTO users');
    expect(sql).toContain('INSERT INTO reward_challenges');
    expect(sql.indexOf('INSERT INTO users')).toBeLessThan(sql.indexOf('INSERT INTO reward_challenges'));
    expect(sql).toContain(`'${challengeId}'`);
    expect(sql).toContain(`'${userId}'`);
    expect(sql).toContain("'aries'");
    expect(sql).toContain("'2026-07-27T10:00:00.000Z'");
    expect(evidence).toEqual({
      operation: 'create',
      challengePrefix: '22222222',
      userPrefix: 'admob-verify-',
      status: 'pending',
      transactionPrefix: null,
      expiresAt: '2026-07-27T10:15:00.000Z'
    });
    const serializedLogs = JSON.stringify(log.mock.calls);
    expect(serializedLogs).not.toContain(challengeId);
    expect(serializedLogs).not.toContain(userId);
  });

  it('rejects a mismatched or already-verified row after creation', () => {
    const runSql = vi.fn()
      .mockReturnValueOnce([{ success: true, meta: { changes: 1 } }])
      .mockReturnValueOnce([{
        success: true,
        results: [{
          id: challengeId,
          user_id: userId,
          status: 'verified',
          transaction_id: 'unexpected-transaction',
          expires_at: '2026-07-27T10:15:00.000Z'
        }]
      }]);
    const log = vi.fn();

    expect(() =>
      executeVerificationChallengeCommand({
        command: 'create',
        env: { ADMOB_SSV_TEST_USER_ID: userId, ADMOB_SSV_TEST_CUSTOM_DATA: challengeId },
        now: new Date('2026-07-27T10:00:00.000Z'),
        runSql,
        log
      })
    ).toThrow(/readback was not confirmed/);
    expect(log).not.toHaveBeenCalled();
  });

  it('inspects a namespaced row and emits only prefixes', () => {
    const runSql = vi.fn().mockReturnValue([
      {
        success: true,
        results: [
          {
            id: challengeId,
            user_id: userId,
            status: 'verified',
            transaction_id: '18fa792de1bca816048293fc71035638',
            expires_at: '2026-07-27T10:15:00.000Z'
          }
        ]
      }
    ]);
    const log = vi.fn();

    const evidence = executeVerificationChallengeCommand({
      command: 'inspect',
      env: { ADMOB_SSV_TEST_USER_ID: userId, ADMOB_SSV_TEST_CUSTOM_DATA: challengeId },
      runSql,
      log
    });

    expect(runSql.mock.calls[0]?.[0]).toContain(`user_id = '${userId}'`);
    expect(runSql.mock.calls[0]?.[0]).toContain("user_id LIKE 'admob-verify-%'");
    expect(evidence).toEqual({
      operation: 'inspect',
      challengePrefix: '22222222',
      userPrefix: 'admob-verify-',
      status: 'verified',
      transactionPrefix: '18fa792d',
      expiresAt: '2026-07-27T10:15:00.000Z'
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(challengeId);
    expect(JSON.stringify(log.mock.calls)).not.toContain(userId);
  });

  it('rejects a verified challenge belonging to a different synthetic test user', () => {
    const otherUserId = 'admob-verify-33333333-3333-4333-8333-333333333333';
    const runSql = vi.fn().mockReturnValue([{
      success: true,
      results: [{
        id: challengeId,
        user_id: otherUserId,
        status: 'verified',
        transaction_id: '18fa792de1bca816048293fc71035638',
        expires_at: '2026-07-27T10:15:00.000Z'
      }]
    }]);
    const log = vi.fn();

    expect(() =>
      executeVerificationChallengeCommand({
        command: 'inspect',
        env: {
          ADMOB_SSV_TEST_USER_ID: userId,
          ADMOB_SSV_TEST_CUSTOM_DATA: challengeId
        },
        runSql,
        log
      })
    ).toThrow(/not found|user mismatch/i);
    expect(log).not.toHaveBeenCalled();
  });

  it('deletes only the exact namespaced challenge and verifies cleanup before success', () => {
    const runSql = vi
      .fn()
      .mockReturnValueOnce([{ success: true, meta: { changes: 1 } }])
      .mockReturnValueOnce([
        { success: true, results: [{ challenge_count: 0, user_count: 0 }] }
      ]);
    const log = vi.fn();

    const evidence = executeVerificationChallengeCommand({
      command: 'delete',
      env: {
        ADMOB_SSV_TEST_USER_ID: userId,
        ADMOB_SSV_TEST_CUSTOM_DATA: challengeId
      },
      runSql,
      log
    });

    expect(runSql).toHaveBeenCalledTimes(2);
    const deleteSql = runSql.mock.calls[0]?.[0] as string;
    const verifySql = runSql.mock.calls[1]?.[0] as string;
    expect(deleteSql).toContain(`id = '${challengeId}'`);
    expect(deleteSql).toContain(`user_id = '${userId}'`);
    expect(deleteSql).toContain('DELETE FROM users');
    expect(deleteSql.indexOf('DELETE FROM reward_challenges')).toBeLessThan(
      deleteSql.indexOf('DELETE FROM users')
    );
    expect(deleteSql).toContain(`id = '${userId}'`);
    expect(deleteSql).toContain('NOT EXISTS');
    expect(verifySql).toContain('challenge_count');
    expect(verifySql).toContain('user_count');
    expect(evidence).toEqual({
      operation: 'delete',
      deletedChallengePrefix: '22222222',
      cleanupVerified: true
    });
    const serializedLogs = JSON.stringify(log.mock.calls);
    expect(serializedLogs).not.toContain(challengeId);
    expect(serializedLogs).not.toContain(userId);
  });

  it('fails closed when post-delete cleanup verification finds temporary state', () => {
    const runSql = vi
      .fn()
      .mockReturnValueOnce([{ success: true, meta: { changes: 1 } }])
      .mockReturnValueOnce([
        { success: true, results: [{ challenge_count: 1, user_count: 0 }] }
      ]);
    const log = vi.fn();

    expect(() =>
      executeVerificationChallengeCommand({
        command: 'delete',
        env: {
          ADMOB_SSV_TEST_USER_ID: userId,
          ADMOB_SSV_TEST_CUSTOM_DATA: challengeId
        },
        runSql,
        log
      })
    ).toThrow(/cleanup verification failed/i);

    expect(runSql).toHaveBeenCalledTimes(2);
    expect(log).not.toHaveBeenCalled();
  });

  it('rejects missing secrets before running SQL', () => {
    const runSql = vi.fn();

    expect(() =>
      executeVerificationChallengeCommand({ command: 'create', env: {}, runSql })
    ).toThrow(/ADMOB_SSV_TEST_USER_ID/);
    expect(() =>
      executeVerificationChallengeCommand({ command: 'inspect', env: {}, runSql })
    ).toThrow(/ADMOB_SSV_TEST_CUSTOM_DATA/);
    expect(() =>
      executeVerificationChallengeCommand({
        command: 'inspect',
        env: { ADMOB_SSV_TEST_CUSTOM_DATA: challengeId },
        runSql
      })
    ).toThrow(/ADMOB_SSV_TEST_USER_ID/);
    expect(() =>
      executeVerificationChallengeCommand({
        command: 'delete',
        env: { ADMOB_SSV_TEST_CUSTOM_DATA: challengeId },
        runSql
      })
    ).toThrow(/ADMOB_SSV_TEST_USER_ID/);
    expect(runSql).not.toHaveBeenCalled();
  });
});
