import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlayClient } from './lib/play-api-client.mjs';
import { capturePlayBackup } from './lib/play-backup.mjs';

function argument(name) {
  const equalsPrefix = `--${name}=`;
  const equalsValue = process.argv.find((value) => value.startsWith(equalsPrefix));
  if (equalsValue) return equalsValue.slice(equalsPrefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function assertSafeOutputPath(outputPath, repositoryRoot = process.cwd()) {
  if (!outputPath) {
    throw new Error('Provide an absolute output path with --output.');
  }
  const resolved = path.resolve(outputPath);
  if (!path.isAbsolute(outputPath)) {
    throw new Error('Play backup output path must be absolute.');
  }
  const resolvedRepository = path.resolve(repositoryRoot);
  if (resolved === resolvedRepository || resolved.startsWith(`${resolvedRepository}${path.sep}`)) {
    throw new Error('Play backup output path must be outside the repository.');
  }
  return resolved;
}

export async function runBackupCli({
  packageName = process.env.PLAY_PACKAGE_NAME,
  credentialsPath = process.env.PLAY_SERVICE_ACCOUNT_JSON_PATH,
  outputPath = argument('output'),
  repositoryRoot = process.cwd(),
  fetchImpl = fetch,
} = {}) {
  const resolvedOutput = assertSafeOutputPath(outputPath, repositoryRoot);
  const client = createPlayClient({ packageName, credentialsPath, fetchImpl });
  const backup = await capturePlayBackup(client);
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true, mode: 0o700 });
  const descriptor = fs.openSync(resolvedOutput, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(backup, null, 2)}\n`, 'utf8');
  } finally {
    fs.closeSync(descriptor);
  }
  fs.chmodSync(resolvedOutput, 0o600);

  const production = backup.tracks.production?.releases?.[0];
  const rollout = production?.userFraction ?? (production?.status === 'completed' ? 1 : null);
  const subscriptionPairs = backup.subscriptions.flatMap((subscription) =>
    subscription.basePlans.map((plan) => `${subscription.productId}/${plan.basePlanId}`),
  );
  console.log(`Play backup written: ${resolvedOutput}`);
  console.log(`Locales: ${backup.listings.length}`);
  console.log(`Production rollout: ${String(rollout)}`);
  console.log(`Subscriptions: ${subscriptionPairs.sort().join(', ')}`);
  return { backup, outputPath: resolvedOutput };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  runBackupCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`Recommended temporary directory: ${os.tmpdir()}`);
    process.exit(1);
  });
}

export { assertSafeOutputPath };
