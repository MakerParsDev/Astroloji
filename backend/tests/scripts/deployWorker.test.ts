import { describe, expect, it, vi } from 'vitest';

import { buildWorkerDeployArgs, runWorkerDeploy } from '../../scripts/deploy-worker';

function runtimeEnvironment(): NodeJS.ProcessEnv {
  return {
    PLAY_RTDN_AUDIENCE: 'https://example.test/api/v1/webhooks/play-rtdn',
    PLAY_RTDN_SERVICE_ACCOUNT_EMAIL: 'play-rtdn-push@example-project.iam.gserviceaccount.com',
    ADMIN_PANEL_ACCESS_TEAM_DOMAIN: 'oaslananka.cloudflareaccess.com',
    ADMIN_PANEL_ACCESS_AUD: 'test-astroloji-aud'
  };
}

describe('Worker deploy runtime configuration', () => {
  it('builds exact Wrangler var arguments without adding values elsewhere', () => {
    const environment = runtimeEnvironment();
    expect(buildWorkerDeployArgs(environment)).toEqual([
      'wrangler',
      'deploy',
      '--var',
      `PLAY_RTDN_AUDIENCE:${environment.PLAY_RTDN_AUDIENCE}`,
      '--var',
      `PLAY_RTDN_SERVICE_ACCOUNT_EMAIL:${environment.PLAY_RTDN_SERVICE_ACCOUNT_EMAIL}`,
      '--var',
      `ADMIN_PANEL_ACCESS_TEAM_DOMAIN:${environment.ADMIN_PANEL_ACCESS_TEAM_DOMAIN}`,
      '--var',
      `ADMIN_PANEL_ACCESS_AUD:${environment.ADMIN_PANEL_ACCESS_AUD}`
    ]);
  });
  it.each(['PLAY_RTDN_AUDIENCE', 'PLAY_RTDN_SERVICE_ACCOUNT_EMAIL'] as const)(
    'fails before invoking Wrangler when %s is missing',
    (missing) => {
      const environment = runtimeEnvironment();
      delete environment[missing];
      const execute = vi.fn();

      expect(() => runWorkerDeploy({ environment, execute, cwd: '/repo', platform: 'linux' })).toThrow(
        `Missing required Worker runtime variable: ${missing}`
      );
      expect(execute).not.toHaveBeenCalled();
    }
  );

  it('invokes npx Wrangler with inherited stdio after validation', () => {
    const execute = vi.fn();
    const environment = runtimeEnvironment();
    runWorkerDeploy({ environment, execute, cwd: '/repo', platform: 'linux' });

    expect(execute).toHaveBeenCalledWith(
      'npx',
      buildWorkerDeployArgs(environment),
      expect.objectContaining({ cwd: '/repo', shell: false, stdio: 'inherit' })
    );
  });
});

describe('buildWorkerDeployArgs admin panel variables', () => {
  function baseEnv(): NodeJS.ProcessEnv {
    return {
      PLAY_RTDN_AUDIENCE: 'https://example.test/api/v1/webhooks/play-rtdn',
      PLAY_RTDN_SERVICE_ACCOUNT_EMAIL: 'play-rtdn-push@example-project.iam.gserviceaccount.com',
      ADMIN_PANEL_ACCESS_TEAM_DOMAIN: 'oaslananka.cloudflareaccess.com',
      ADMIN_PANEL_ACCESS_AUD: 'test-astroloji-aud'
    };
  }

  it('passes the Cloudflare Access team domain and aud as deploy-time vars', () => {
    const args = buildWorkerDeployArgs(baseEnv());
    expect(args).toContain('ADMIN_PANEL_ACCESS_TEAM_DOMAIN:oaslananka.cloudflareaccess.com');
    expect(args).toContain('ADMIN_PANEL_ACCESS_AUD:test-astroloji-aud');
  });

  it('throws when ADMIN_PANEL_ACCESS_TEAM_DOMAIN is missing', () => {
    const env = baseEnv();
    delete env.ADMIN_PANEL_ACCESS_TEAM_DOMAIN;
    expect(() => buildWorkerDeployArgs(env)).toThrow(/ADMIN_PANEL_ACCESS_TEAM_DOMAIN/);
  });

  it('throws when ADMIN_PANEL_ACCESS_AUD is missing', () => {
    const env = baseEnv();
    delete env.ADMIN_PANEL_ACCESS_AUD;
    expect(() => buildWorkerDeployArgs(env)).toThrow(/ADMIN_PANEL_ACCESS_AUD/);
  });

  it('still requires the pre-existing RTDN variables', () => {
    const env = baseEnv();
    delete env.PLAY_RTDN_AUDIENCE;
    expect(() => buildWorkerDeployArgs(env)).toThrow(/PLAY_RTDN_AUDIENCE/);
  });
});