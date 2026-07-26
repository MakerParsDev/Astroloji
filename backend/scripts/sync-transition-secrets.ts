import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  TRANSITION_SECRET_NAMES,
  type TransitionSecretName,
  downloadDopplerSecrets,
  resolveNpxInvocation,
  resolveTransitionSecrets
} from './shared';

const COMMITTED_TRANSITION_CONFIG = 'wrangler.transition.toml';
const REVIEWED_DEPLOY_CONFIG = '.wrangler.transition.deploy.toml';
const WRANGLER_TIMEOUT_MS = 120_000;

export interface ResolveTransitionConfigOptions {
  requested?: string;
  cwd?: string;
}

export function resolveTransitionConfig(
  options: ResolveTransitionConfigOptions = {}
): string {
  const cwd = path.resolve(options.cwd ?? '.');
  const requested =
    options.requested ??
    process.env.TRANSITION_WRANGLER_CONFIG ??
    COMMITTED_TRANSITION_CONFIG;

  if (requested !== COMMITTED_TRANSITION_CONFIG && requested !== REVIEWED_DEPLOY_CONFIG) {
    throw new Error('Transition Wrangler config path is not allowed.');
  }

  const configPath = path.join(cwd, requested);
  const config = readFileSync(configPath, 'utf8');
  if (!/^name\s*=\s*"astrology-ssv-transition"\s*$/m.test(config)) {
    throw new Error('Transition Wrangler config must target astrology-ssv-transition.');
  }
  if (!/^main\s*=\s*"src\/transition\/index\.ts"\s*$/m.test(config)) {
    throw new Error('Transition Wrangler config must use the transition entrypoint.');
  }
  if (!/^workers_dev\s*=\s*false\s*$/m.test(config)) {
    throw new Error('Transition Wrangler config must disable workers.dev.');
  }
  if (/^\s*\[\[routes\]\]/m.test(config)) {
    throw new Error('Transition Wrangler config must remain route-free.');
  }

  return configPath;
}

interface ExecOptions {
  cwd: string;
  input: string;
  encoding: 'utf8';
  stdio: ['pipe', 'inherit', 'inherit'];
  shell: boolean;
  timeout: number;
}

type Execute = (
  executable: string,
  args: string[],
  options: ExecOptions
) => unknown;

export interface PutTransitionSecretOptions {
  configPath: string;
  cwd?: string;
  platform?: NodeJS.Platform;
  execute?: Execute;
  timeoutMs?: number;
}

export function putTransitionSecret(
  name: TransitionSecretName,
  value: string,
  options: PutTransitionSecretOptions
): void {
  const cwd = path.resolve(options.cwd ?? '.');
  const invocation = resolveNpxInvocation(options.platform);
  const execute = options.execute ?? (execFileSync as unknown as Execute);
  const args = [
    'wrangler',
    'secret',
    'put',
    name,
    '--config',
    options.configPath
  ];

  execute(invocation.executable, args, {
    cwd,
    input: value,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: invocation.shell,
    timeout: options.timeoutMs ?? WRANGLER_TIMEOUT_MS
  });
}

export interface SyncTransitionSecretsOptions {
  configPath: string;
  putSecret?: (name: TransitionSecretName, value: string) => void;
  log?: (message: string) => void;
}

export function syncTransitionSecrets(
  secrets: Record<TransitionSecretName, string>,
  options: SyncTransitionSecretsOptions
): void {
  const log = options.log ?? console.log;
  const putSecret =
    options.putSecret ??
    ((name: TransitionSecretName, value: string) =>
      putTransitionSecret(name, value, { configPath: options.configPath }));

  for (const name of TRANSITION_SECRET_NAMES) {
    try {
      putSecret(name, secrets[name]);
    } catch (error) {
      throw new Error(
        `Failed to sync transition Worker secret ${name}. ` +
          'The Worker is still unrouted; fix the error and safely rerun the deployment workflow.',
        { cause: error }
      );
    }
    log(`Synced transition Worker secret: ${name}`);
  }

  log(`Synced ${TRANSITION_SECRET_NAMES.length} minimum transition secrets.`);
}

export function main(): void {
  const configPath = resolveTransitionConfig();
  const secrets = resolveTransitionSecrets(downloadDopplerSecrets());
  syncTransitionSecrets(secrets, { configPath });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
