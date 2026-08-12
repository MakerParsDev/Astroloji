import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveNpxInvocation } from './shared';

const RTDN_RUNTIME_VARIABLES = [
  'PLAY_RTDN_AUDIENCE',
  'PLAY_RTDN_SERVICE_ACCOUNT_EMAIL'
] as const;

const ADMIN_PANEL_RUNTIME_VARIABLES = ['ADMIN_PANEL_FIREBASE_PROJECT_ID'] as const;

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
}

export function buildWorkerDeployArgs(environment: NodeJS.ProcessEnv): string[] {
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
    `ADMIN_PANEL_FIREBASE_PROJECT_ID:${environment.ADMIN_PANEL_FIREBASE_PROJECT_ID}`
  ];
}

export function runWorkerDeploy(options: WorkerDeployOptions = {}): void {
  const environment = options.environment ?? process.env;
  const args = buildWorkerDeployArgs(environment);
  const platform = options.platform ?? process.platform;
  const { executable, shell } = resolveNpxInvocation(platform);
  const execute = options.execute ?? (execFileSync as Execute);

  execute(executable, args, {
    cwd: options.cwd ?? path.resolve('.'),
    shell,
    stdio: 'inherit'
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWorkerDeploy();
}