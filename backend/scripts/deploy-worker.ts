import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  CLOUDFLARE_SECRET_NAMES,
  downloadDopplerSecrets,
  resolveCloudflareSecrets,
  resolveNpxInvocation
} from './shared';

const RTDN_RUNTIME_VARIABLES = [
  'PLAY_RTDN_AUDIENCE',
  'PLAY_RTDN_SERVICE_ACCOUNT_EMAIL'
] as const;

const ADMIN_PANEL_RUNTIME_VARIABLES = ['ADMIN_PANEL_ACCESS_TEAM_DOMAIN', 'ADMIN_PANEL_ACCESS_AUD'] as const;

type Execute = (
  executable: string,
  args: string[],
  options: { cwd: string; shell: boolean; stdio: 'inherit' }
) => unknown;

export interface WorkerDeployOptions {
  environment?: NodeJS.ProcessEnv;
  cwd?: string;
  platform?: NodeJS.Platform;
  execute?: Execute;
  secretsFile?: string;
  downloadSecrets?: () => Record<string, string>;
}

export function buildWorkerDeployArgs(environment: NodeJS.ProcessEnv, secretsFile?: string): string[] {
  for (const name of [...RTDN_RUNTIME_VARIABLES, ...ADMIN_PANEL_RUNTIME_VARIABLES]) {
    if (!environment[name]) {
      throw new Error(`Missing required Worker runtime variable: ${name}`);
    }
  }
  return [
    'wrangler',
    'deploy',
    '--var',
    `PLAY_RTDN_AUDIENCE:${environment.PLAY_RTDN_AUDIENCE}`,
    '--var',
    `PLAY_RTDN_SERVICE_ACCOUNT_EMAIL:${environment.PLAY_RTDN_SERVICE_ACCOUNT_EMAIL}`,
    '--var',
    `ADMIN_PANEL_ACCESS_TEAM_DOMAIN:${environment.ADMIN_PANEL_ACCESS_TEAM_DOMAIN}`,
    '--var',
    `ADMIN_PANEL_ACCESS_AUD:${environment.ADMIN_PANEL_ACCESS_AUD}`,
    ...(secretsFile ? ['--secrets-file', secretsFile] : [])
  ];
}

export function runWorkerDeploy(options: WorkerDeployOptions = {}): void {
  const environment = options.environment ?? process.env;
  const args = buildWorkerDeployArgs(environment, options.secretsFile);
  const platform = options.platform ?? process.platform;
  const { executable, shell } = resolveNpxInvocation(platform);
  const execute = options.execute ?? (execFileSync as Execute);

  execute(executable, args, {
    cwd: options.cwd ?? path.resolve('.'),
    shell,
    stdio: 'inherit'
  });
}

/**
 * Stage only the Worker bindings required by this project.
 * Cloudflare's --secrets-file uploads code and secrets as ONE Worker version;
 * separate 'wrangler secret put' calls would publish intermediate live versions.
 */
export function runWorkerDeployWithSecrets(options: WorkerDeployOptions = {}): void {
  const environment = options.environment ?? process.env;
  // Fail before contacting Doppler or touching any files when runtime config is incomplete.
  buildWorkerDeployArgs(environment);
  const allSecrets = resolveCloudflareSecrets(
    (options.downloadSecrets ?? downloadDopplerSecrets)(),
    environment
  );
  const requiredSecrets = Object.fromEntries(
    CLOUDFLARE_SECRET_NAMES.map((name) => [name, allSecrets[name]])
  );

  const directory = mkdtempSync(path.join(tmpdir(), 'astrology-worker-deploy-'));
  try {
    const secretsFile = path.join(directory, 'secrets.json');
    writeFileSync(secretsFile, JSON.stringify(requiredSecrets), { mode: 0o600 });
    runWorkerDeploy({ ...options, secretsFile });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWorkerDeployWithSecrets();
}