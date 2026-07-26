import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  TRANSITION_SECRET_NAMES,
  resolveTransitionSecrets,
  resolveNpxInvocation
} from '../../scripts/shared';
import {
  buildDeleteVerificationChallengeSql,
  buildInsertVerificationChallengeSql,
  createVerificationChallengeValues,
  formatVerificationEvidence
} from '../../scripts/create-admob-verification-challenge';
import {
  putTransitionSecret,
  resolveTransitionConfig,
  syncTransitionSecrets
} from '../../scripts/sync-transition-secrets';

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



  it('uses direct npx executables without constructing a command string', () => {
    expect(resolveNpxInvocation('linux')).toEqual({ executable: 'npx', shell: false });
    expect(resolveNpxInvocation('win32')).toEqual({ executable: 'npx.cmd', shell: true });
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


describe('transition secret synchronization', () => {
  function withTransitionConfig(
    fileName: 'wrangler.transition.toml' | '.wrangler.transition.deploy.toml',
    body = `name = "astrology-ssv-transition"
main = "src/transition/index.ts"
workers_dev = false

[vars]
LEGACY_REWARD_FORWARD_UNTIL = "2026-08-09T21:00:00Z"
`
  ) {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'astrology-transition-'));
    writeFileSync(path.join(directory, fileName), body, 'utf8');
    return {
      directory,
      cleanup: () => rmSync(directory, { recursive: true, force: true })
    };
  }

  it('accepts only the committed or reviewed temporary config for the transition Worker', () => {
    for (const fileName of ['wrangler.transition.toml', '.wrangler.transition.deploy.toml'] as const) {
      const fixture = withTransitionConfig(fileName);
      try {
        expect(resolveTransitionConfig({ requested: fileName, cwd: fixture.directory })).toBe(
          path.join(fixture.directory, fileName)
        );
      } finally {
        fixture.cleanup();
      }
    }
  });

  it('rejects arbitrary paths, another Worker, or a config containing routes', () => {
    const fixture = withTransitionConfig('wrangler.transition.toml');
    try {
      expect(() =>
        resolveTransitionConfig({ requested: '../other.toml', cwd: fixture.directory })
      ).toThrow('Transition Wrangler config path is not allowed.');
    } finally {
      fixture.cleanup();
    }

    const wrongWorker = withTransitionConfig(
      '.wrangler.transition.deploy.toml',
      'name = "another-worker"\nmain = "src/transition/index.ts"\nworkers_dev = false\n'
    );
    try {
      expect(() =>
        resolveTransitionConfig({
          requested: '.wrangler.transition.deploy.toml',
          cwd: wrongWorker.directory
        })
      ).toThrow('Transition Wrangler config must target astrology-ssv-transition.');
    } finally {
      wrongWorker.cleanup();
    }

    const routed = withTransitionConfig(
      '.wrangler.transition.deploy.toml',
      'name = "astrology-ssv-transition"\nmain = "src/transition/index.ts"\nworkers_dev = false\n[[routes]]\npattern = "example.com/*"\n'
    );
    try {
      expect(() =>
        resolveTransitionConfig({
          requested: '.wrangler.transition.deploy.toml',
          cwd: routed.directory
        })
      ).toThrow('Transition Wrangler config must remain route-free.');
    } finally {
      routed.cleanup();
    }
  });

  it.each([
    ['linux', 'npx', false],
    ['win32', 'npx.cmd', true]
  ] as const)(
    'invokes Wrangler safely on %s with config, stdin, and a bounded timeout',
    (platform, executable, shell) => {
      const execute = vi.fn();
      putTransitionSecret('JWT_SECRET', 'jwt-value', {
        configPath: '/repo/.wrangler.transition.deploy.toml',
        cwd: '/repo',
        platform,
        execute
      });

      expect(execute).toHaveBeenCalledWith(
        executable,
        [
          'wrangler',
          'secret',
          'put',
          'JWT_SECRET',
          '--config',
          '/repo/.wrangler.transition.deploy.toml'
        ],
        expect.objectContaining({
          cwd: '/repo',
          input: 'jwt-value',
          shell,
          timeout: 120_000
        })
      );
    }
  );

  it('reports partial synchronization as a safe retry and never prints final success', () => {
    const log = vi.fn();
    const putSecret = vi
      .fn()
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('Wrangler timed out');
      });

    expect(() =>
      syncTransitionSecrets(
        { JWT_SECRET: 'jwt', ADMOB_REWARDED_ID: 'admob' },
        { configPath: '/repo/.wrangler.transition.deploy.toml', putSecret, log }
      )
    ).toThrow(
      'Failed to sync transition Worker secret ADMOB_REWARDED_ID. The Worker is still unrouted; fix the error and safely rerun the deployment workflow.'
    );
    expect(log).toHaveBeenCalledWith('Synced transition Worker secret: JWT_SECRET');
    expect(log).not.toHaveBeenCalledWith('Synced 2 minimum transition secrets.');
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
