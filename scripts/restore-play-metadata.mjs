import { cliArgument as argument } from './lib/cli-arguments.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlayClient } from './lib/play-api-client.mjs';
import {
  assertBackupRestorable,
  readBackupFile,
  restoreConfirmation,
  restorePreparedMetadata,
  verifyBackupRestoredState,
} from './lib/play-publication.mjs';


export async function runRestoreCli({
  packageName = process.env.PLAY_PACKAGE_NAME,
  credentialsPath = process.env.PLAY_SERVICE_ACCOUNT_JSON_PATH,
  backupPath = argument('backup'),
  confirmation = argument('confirmation'),
  deferReview = process.env.PLAY_CHANGES_NOT_SENT_FOR_REVIEW?.toLowerCase() === 'true',
  fetchImpl = fetch,
  client: injectedClient,
  independentReadback,
} = {}) {
  if (!backupPath) throw new Error('Provide --backup=<absolute-path>.');
  const resolvedBackup = path.resolve(backupPath);
  const { backup, backupDigest } = readBackupFile(resolvedBackup);
  assertBackupRestorable(backup);
  const expectedConfirmation = restoreConfirmation(backupDigest);
  const imageCount = backup.listings.reduce(
    (total, listing) =>
      total + Object.values(listing.images ?? {}).reduce((sum, images) => sum + images.length, 0),
    0,
  );
  console.log(
    `RESTORE DRY-RUN package=${backup.packageName} locales=${backup.listings.length} images=${imageCount}`,
  );
  console.log(`BACKUP SHA256: ${backupDigest}`);
  console.log(`REQUIRED CONFIRMATION: ${expectedConfirmation}`);

  if (!confirmation) {
    return { dryRun: true, backupDigest, expectedConfirmation };
  }

  const client = injectedClient ?? createPlayClient({ packageName, credentialsPath, fetchImpl });
  const result = await restorePreparedMetadata({
    client,
    backup,
    backupDigest,
    confirmation,
    fetchImpl,
    changesNotSentForReview: deferReview,
    independentReadback:
      independentReadback ?? ((state) => verifyBackupRestoredState(client, state)),
  });
  console.log(`Restored and verified Play metadata edit ${result.editId}.`);
  return { ...result, dryRun: false, backupDigest };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  runRestoreCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
