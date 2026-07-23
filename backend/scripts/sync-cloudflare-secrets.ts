import { execFileSync } from 'node:child_process';
import path from 'node:path';

import {
  CLOUDFLARE_SECRET_NAMES,
  DOPPLER_CONFIG,
  DOPPLER_PROJECT,
  downloadDopplerSecrets,
  resolveCloudflareSecrets,
} from './shared';

function main() {
  const secrets = resolveCloudflareSecrets(downloadDopplerSecrets());

  for (const name of CLOUDFLARE_SECRET_NAMES) {
    if (process.platform === 'win32') {
      execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `npx wrangler secret put ${name}`], {
        cwd: path.resolve('.'),
        input: secrets[name],
        encoding: 'utf8',
        stdio: ['pipe', 'inherit', 'inherit'],
      });
    } else {
      execFileSync('npx', ['wrangler', 'secret', 'put', name], {
        cwd: path.resolve('.'),
        input: secrets[name],
        encoding: 'utf8',
        stdio: ['pipe', 'inherit', 'inherit'],
      });
    }
    console.log(`Synced Cloudflare secret: ${name}`);
  }

  console.log(
    `Finished syncing Cloudflare Worker secrets from Doppler config ${DOPPLER_PROJECT}/${DOPPLER_CONFIG}.`,
  );
}

main();
