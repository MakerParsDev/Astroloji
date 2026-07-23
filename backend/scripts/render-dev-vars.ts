import path from 'node:path';

import {
  CLOUDFLARE_SECRET_NAMES,
  DOPPLER_CONFIG,
  DOPPLER_PROJECT,
  downloadDopplerSecrets,
  ensureRequiredSecrets,
  writeFileEnsuringDir,
} from './shared';

function escapeEnvValue(value: string) {
  return JSON.stringify(value);
}

function main() {
  const secrets = downloadDopplerSecrets();
  ensureRequiredSecrets(secrets);

  const devVarsPath = path.resolve('.dev.vars');
  const contents = [
    '# Generated from Doppler. Do not edit manually.',
    `# Project: ${DOPPLER_PROJECT}`,
    `# Config: ${DOPPLER_CONFIG}`,
    ...CLOUDFLARE_SECRET_NAMES.map((name) => `${name}=${escapeEnvValue(secrets[name])}`),
    '',
  ].join('\n');

  writeFileEnsuringDir(devVarsPath, contents);
  console.log(`Wrote ${devVarsPath} from Doppler config ${DOPPLER_PROJECT}/${DOPPLER_CONFIG}.`);
}

main();
