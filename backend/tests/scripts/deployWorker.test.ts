import { describe, expect, it, vi } from 'vitest';

import { buildWorkerDeployArgs, runWorkerDeploy } from '../../scripts/deploy-worker';

function runtimeEnvironment(): NodeJS.ProcessEnv {
  return {
    PLAY_RTDN_AUDIENCE: 'https://example.test/api/v1/webhooks/play-rtdn',
    PLAY_RTDN_SERVICE_ACCOUNT_EMAIL: 'play-rtdn-push@example-project.iam.gserviceaccount.com'
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
      `PLAY_RTDN_SERVICE_ACCOUNT_EMAIL:${environment.PLAY_RTDN_SERVICE_ACCOUNT_EMAIL}`
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