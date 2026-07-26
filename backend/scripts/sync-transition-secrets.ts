import { execFileSync } from 'node:child_process';
import path from 'node:path';

import {
  TRANSITION_SECRET_NAMES,
  downloadDopplerSecrets,
  resolveTransitionSecrets
} from './shared';

function putSecret(name: string, value: string): void {
  const args = [
    'wrangler',
    'secret',
    'put',
    name,
    '--config',
    'wrangler.transition.toml'
  ];

  if (process.platform === 'win32') {
    execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `npx ${args.join(' ')}`], {
      cwd: path.resolve('.'),
      input: value,
      encoding: 'utf8',
      stdio: ['pipe', 'inherit', 'inherit']
    });
    return;
  }

  execFileSync('npx', args, {
    cwd: path.resolve('.'),
    input: value,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit']
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
