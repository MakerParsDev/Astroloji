import { execFileSync } from 'node:child_process';
import path from 'node:path';

import {
  TRANSITION_SECRET_NAMES,
  downloadDopplerSecrets,
  resolveTransitionSecrets,
  resolveNpxInvocation
} from './shared';

function transitionConfig(): string {
  return process.env.TRANSITION_WRANGLER_CONFIG ?? 'wrangler.transition.toml';
}

function putSecret(name: string, value: string): void {
  const args = [
    'wrangler',
    'secret',
    'put',
    name,
    '--config',
    transitionConfig()
  ];

  const invocation = resolveNpxInvocation();
  execFileSync(invocation.executable, args, {
    cwd: path.resolve('.'),
    input: value,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: invocation.shell
  });
}

function main(): void {
  const secrets = resolveTransitionSecrets(downloadDopplerSecrets());
  for (const name of TRANSITION_SECRET_NAMES) {
    putSecret(name, secrets[name]);
    console.log(`Synced transition Worker secret: ${name}`);
  }
  console.log(`Synced ${TRANSITION_SECRET_NAMES.length} minimum transition secrets.`);
}

main();
