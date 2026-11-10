import { existsSync, readFileSync, statSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { buildWorkerDeployArgs, runWorkerDeploy, runWorkerDeployWithSecrets } from '../../scripts/deploy-worker';

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

describe('atomic code + secret deployment', () => {
  it('keeps the production deploy entry point away from individual secret puts', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
    ) as { scripts: Record<string, string> };
    expect(packageJson.scripts['deploy:doppler']).toBe('tsx scripts/deploy-worker.ts');
    expect(packageJson.scripts['deploy:doppler']).not.toContain('doppler:cf-secrets');
  });

  const secretValues = {
    JWT_SECRET: 'synthetic-jwt',
    GOOGLE_SERVICE_ACCOUNT_JSON: '{"test":true}',
    FIREBASE_SERVICE_ACCOUNT_JSON: '{"test":true}',
    ADMOB_REWARDED_ID: 'synthetic-reward-unit',
    BIRTH_DATA_ENCRYPTION_KEY: 'synthetic-birth-key',
    UNRELATED_DOPPLER_KEY: 'must-not-leak'
  };

  it('uploads whitelisted secrets alongside code in one deploy and removes staged file', () => {
    const downloadSecrets = vi.fn(() => ({ ...secretValues }));
    let stagedFile = '';
    const execute = vi.fn((_command: string, args: string[]) => {
      expect(args[0]).toBe('wrangler');
      expect(args[1]).toBe('deploy');
      expect(args).not.toContain('secret');
      const index = args.indexOf('--secrets-file');
      expect(index).toBeGreaterThan(1);
      stagedFile = args[index + 1];
      expect(statSync(stagedFile).mode & 0o777).toBe(0o600);
      expect(JSON.parse(readFileSync(stagedFile, 'utf8'))).toEqual({
        JWT_SECRET: secretValues.JWT_SECRET,
        GOOGLE_SERVICE_ACCOUNT_JSON: secretValues.GOOGLE_SERVICE_ACCOUNT_JSON,
        FIREBASE_SERVICE_ACCOUNT_JSON: secretValues.FIREBASE_SERVICE_ACCOUNT_JSON,
        ADMOB_REWARDED_ID: secretValues.ADMOB_REWARDED_ID,
        BIRTH_DATA_ENCRYPTION_KEY: secretValues.BIRTH_DATA_ENCRYPTION_KEY
      });
      expect(args.join(' ')).not.toContain(secretValues.JWT_SECRET);
    });
    runWorkerDeployWithSecrets({
      environment: runtimeEnvironment(),
      downloadSecrets,
      execute,
      cwd: '/repo',
      platform: 'linux'
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(downloadSecrets).toHaveBeenCalledTimes(1);
    expect(existsSync(stagedFile)).toBe(false);
  });

  it('cleans the secrets file even when the Wrangler deployment fails', () => {
    let file = '';
    const execute = vi.fn((_command: string, args: string[]) => {
      file = args[args.indexOf('--secrets-file') + 1];
      expect(existsSync(file)).toBe(true);
      throw new Error('synthetic-deploy-failure');
    });
    expect(() => runWorkerDeployWithSecrets({
      environment: runtimeEnvironment(),
      downloadSecrets: () => ({ ...secretValues }),
      execute,
      cwd: '/repo',
      platform: 'linux'
    })).toThrow('synthetic-deploy-failure');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(existsSync(file)).toBe(false);
  });

  it('fails before downloading any secret when required runtime vars are missing', () => {
    const environment = runtimeEnvironment();
    delete environment.ADMIN_PANEL_ACCESS_AUD;
    const downloadSecrets = vi.fn(() => ({ ...secretValues }));
    const execute = vi.fn();
    expect(() => runWorkerDeployWithSecrets({ environment, downloadSecrets, execute })).toThrow(
      'Missing required Worker runtime variable: ADMIN_PANEL_ACCESS_AUD'
    );
    expect(downloadSecrets).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('refuses a partial secret set without touching the Worker', () => {
    const execute = vi.fn();
    const { BIRTH_DATA_ENCRYPTION_KEY: _missing, ...partial } = secretValues;
    expect(() => runWorkerDeployWithSecrets({
      environment: runtimeEnvironment(),
      downloadSecrets: () => partial,
      execute
    })).toThrow('Required Cloudflare secret is missing: BIRTH_DATA_ENCRYPTION_KEY');
    expect(execute).not.toHaveBeenCalled();
  });
});
