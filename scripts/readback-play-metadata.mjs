import { cliArgument as argument } from './lib/cli-arguments.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlayClient } from './lib/play-api-client.mjs';
import { verifyLiveState } from './lib/play-backup.mjs';
import { loadStoreConfig } from './lib/play-store-config.mjs';


export async function runReadbackCli({
  packageName = process.env.PLAY_PACKAGE_NAME,
  credentialsPath = process.env.PLAY_SERVICE_ACCOUNT_JSON_PATH,
  expectedRoot = argument('expected-root') ?? process.cwd(),
  assertedRollout = argument('assert-rollout'),
  fetchImpl = fetch,
} = {}) {
  const repositoryRoot = path.resolve(expectedRoot);
  const storeConfig = loadStoreConfig(repositoryRoot);
  const rollout = assertedRollout === undefined
    ? storeConfig.productionRolloutFraction
    : Number(assertedRollout);
  if (!Number.isFinite(rollout) || rollout < 0 || rollout > 1) {
    throw new Error(`Invalid --assert-rollout value: ${String(assertedRollout)}`);
  }

  const client = createPlayClient({ packageName, credentialsPath, fetchImpl });
  const errors = await verifyLiveState(client, {
    locales: storeConfig.locales,
    productionRolloutFraction: rollout,
    subscriptions: storeConfig.subscriptions,
  });

  if (errors.length > 0) {
    for (const error of errors) console.error(`READBACK DRIFT: ${error}`);
    throw new Error(`Play read-back failed with ${errors.length} drift finding(s).`);
  }

  console.log(
    `Play read-back passed: locales=${storeConfig.locales.join(',')} rollout=${rollout} subscriptions=${storeConfig.subscriptions.length}.`,
  );
  return { errors, storeConfig };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  runReadbackCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
