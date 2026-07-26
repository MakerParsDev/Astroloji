import { describe, expect, it } from 'vitest';

import {
  TRANSITION_SECRET_NAMES,
  resolveTransitionSecrets
} from '../../scripts/shared';
import {
  buildDeleteVerificationChallengeSql,
  buildInsertVerificationChallengeSql,
  createVerificationChallengeValues,
  formatVerificationEvidence
} from '../../scripts/create-admob-verification-challenge';

describe('transition secret resolution', () => {
  it('selects only transition secrets', () => {
    expect(
      resolveTransitionSecrets({
        JWT_SECRET: 'jwt',
        ADMOB_REWARDED_ID: 'ca-app-pub-x/y',
        ADMIN_SECRET: 'must-not-be-synced'
      })
    ).toEqual({
      JWT_SECRET: 'jwt',
      ADMOB_REWARDED_ID: 'ca-app-pub-x/y'
    });
    expect(TRANSITION_SECRET_NAMES).toEqual(['JWT_SECRET', 'ADMOB_REWARDED_ID']);
  });

  it('supports explicit environment overrides and requires both secrets', () => {
    const resolved = resolveTransitionSecrets(
      {
        JWT_SECRET: 'doppler-jwt',
        ADMOB_REWARDED_ID: 'doppler-admob'
      },
      { JWT_SECRET: 'override-jwt' }
    );

    expect(resolved).toEqual({
      JWT_SECRET: 'override-jwt',
      ADMOB_REWARDED_ID: 'doppler-admob'
    });
    expect(() => resolveTransitionSecrets({ JWT_SECRET: 'jwt' }, {})).toThrow(
      'Required transition secret is missing: ADMOB_REWARDED_ID'
    );
  });
});

describe('AdMob verification challenge helpers', () => {
  it('creates deterministic short-lived test values', () => {
    const uuids = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    ];
    const values = createVerificationChallengeValues({
      now: new Date('2026-07-26T20:00:00.000Z'),
      randomUUID: () => uuids.shift() ?? 'unexpected'
    });

    expect(values).toEqual({
      challengeId: '11111111-1111-4111-8111-111111111111',
      userId: 'admob-verify-22222222-2222-4222-8222-222222222222',
      identifier: '2026-07-26',
      createdAt: '2026-07-26T20:00:00.000Z',
      expiresAt: '2026-07-26T20:15:00.000Z'
    });
  });

  it('formats verification output without full identifiers', () => {
    const evidence = formatVerificationEvidence({
      id: '11111111-1111-4111-8111-111111111111',
      user_id: 'admob-verify-secret-user',
      status: 'verified',
      transaction_id: '18fa792de1bca816048293fc71035638',
      expires_at: '2026-07-26T20:15:00.000Z'
    });

    expect(evidence).toEqual({
      challengePrefix: '11111111',
      userPrefix: 'admob-verify-',
      status: 'verified',
      transactionPrefix: '18fa792d',
      expiresAt: '2026-07-26T20:15:00.000Z'
    });
    expect(JSON.stringify(evidence)).not.toContain('secret-user');
    expect(JSON.stringify(evidence)).not.toContain('e1bca816048293fc71035638');
  });

  it('builds a pending daily insert with a fifteen-minute expiry', () => {
    const sql = buildInsertVerificationChallengeSql({
      challengeId: '11111111-1111-4111-8111-111111111111',
      userId: 'admob-verify-22222222-2222-4222-8222-222222222222',
      identifier: '2026-07-26',
      createdAt: '2026-07-26T20:00:00.000Z',
      expiresAt: '2026-07-26T20:15:00.000Z'
    });

    expect(sql).toContain("'daily', '2026-07-26', 'pending'");
    expect(sql).toContain("'2026-07-26T20:15:00.000Z'");
    expect(sql).toContain('NULL, NULL, NULL');
  });

  it('deletes only the exact UUID when it belongs to an AdMob verification user', () => {
    const sql = buildDeleteVerificationChallengeSql(
      '11111111-1111-4111-8111-111111111111'
    );

    expect(sql).toContain("id = '11111111-1111-4111-8111-111111111111'");
    expect(sql).toContain("user_id LIKE 'admob-verify-%'");
    expect(() => buildDeleteVerificationChallengeSql('not-a-uuid')).toThrow(
      'Challenge ID must be a UUID.'
    );
  });
});
