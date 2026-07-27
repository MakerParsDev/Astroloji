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
      identifier: '2026-07-27',
      createdAt: '2026-07-27T10:00:00.000Z',
      expiresAt: '2026-07-27T10:15:00.000Z'
    });
  });
});

describe('verification challenge command execution', () => {
  it('creates the supplied challenge and logs only redacted evidence', () => {
    const runSql = vi.fn().mockReturnValue([{ success: true, meta: { changes: 1 } }]);
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

    expect(runSql).toHaveBeenCalledOnce();
    const sql = runSql.mock.calls[0]?.[0] as string;
    expect(sql).toContain('INSERT OR IGNORE INTO users');
    expect(sql).toContain('INSERT INTO reward_challenges');
    expect(sql.indexOf('INSERT OR IGNORE INTO users')).toBeLessThan(sql.indexOf('INSERT INTO reward_challenges'));
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
      env: { ADMOB_SSV_TEST_CUSTOM_DATA: challengeId },
      runSql,
      log
    });

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

  it('deletes only the exact namespaced challenge and logs only the prefix', () => {
    const runSql = vi.fn().mockReturnValue([{ success: true, meta: { changes: 1 } }]);
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

    const sql = runSql.mock.calls[0]?.[0] as string;
    expect(sql).toContain(`id = '${challengeId}'`);
    expect(sql).toContain(`user_id = '${userId}'`);
    expect(sql).toContain('DELETE FROM users');
    expect(sql.indexOf('DELETE FROM reward_challenges')).toBeLessThan(sql.indexOf('DELETE FROM users'));
    expect(sql).toContain(`id = '${userId}'`);
    expect(sql).toContain('NOT EXISTS');
    expect(evidence).toEqual({ operation: 'delete', deletedChallengePrefix: '22222222' });
    expect(JSON.stringify(log.mock.calls)).not.toContain(challengeId);
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
        command: 'delete',
        env: { ADMOB_SSV_TEST_CUSTOM_DATA: challengeId },
        runSql
      })
    ).toThrow(/ADMOB_SSV_TEST_USER_ID/);
    expect(runSql).not.toHaveBeenCalled();
  });
});
