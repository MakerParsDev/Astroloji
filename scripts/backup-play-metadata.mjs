import { cliArgument as argument } from './lib/cli-arguments.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlayClient } from './lib/play-api-client.mjs';
import { capturePlayBackup } from './lib/play-backup.mjs';
import { loadStoreConfig } from './lib/play-store-config.mjs';
import { releaseRolloutFraction } from './lib/play-release.mjs';


function assertSafeOutputPath(outputPath, repositoryRoot = process.cwd()) {
  if (!outputPath) {
    throw new Error('Provide an absolute output path with --output.');
  }
  const resolved = path.resolve(outputPath);
  if (!path.isAbsolute(outputPath)) {
    throw new Error('Play backup output path must be absolute.');
  }
  const resolvedRepository = path.resolve(repositoryRoot);
  const relative = path.relative(resolvedRepository, resolved);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
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
  const storeConfig = loadStoreConfig(repositoryRoot);
  const backup = await capturePlayBackup(client, { defaultLocale: storeConfig.defaultLocale });
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true, mode: 0o700 });
  const descriptor = fs.openSync(resolvedOutput, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(backup, null, 2)}\n`, 'utf8');
  } finally {
    fs.closeSync(descriptor);
  }
  fs.chmodSync(resolvedOutput, 0o600);

  const rollout = releaseRolloutFraction(backup.tracks.production);
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
