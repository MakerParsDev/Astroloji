import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliArgument as argument } from './lib/cli-arguments.mjs';
import { createPlayClient } from './lib/play-api-client.mjs';
import { capturePlayBackup } from './lib/play-backup.mjs';
import {
  assertBackupMatchesLiveState,
  assertFreshBackup,
  readBackupFile,
} from './lib/play-publication.mjs';

export async function runVerifyPlayBackupCurrent({
  packageName = process.env.PLAY_PACKAGE_NAME,
  credentialsPath = process.env.PLAY_SERVICE_ACCOUNT_JSON_PATH,
  backupPath = argument('backup'),
  maxAgeMinutes = Number(argument('max-backup-age-minutes') ?? 30),
  fetchImpl = fetch,
  client: injectedClient,
  captureCurrentState = (playClient, options) => capturePlayBackup(playClient, options),
} = {}) {
  if (!backupPath) throw new Error('Provide --backup=<absolute-path>.');
  const { backup, backupDigest } = readBackupFile(path.resolve(backupPath));
  assertFreshBackup(backup, { maxAgeMinutes });
  const client = injectedClient ?? createPlayClient({ packageName, credentialsPath, fetchImpl });
  const current = await captureCurrentState(client, { defaultLocale: backup.defaultLocale });
  const digests = assertBackupMatchesLiveState(backup, current);
  console.log(`Approved Play backup still matches live state: ${digests.liveStateDigest}`);
  console.log(`Backup SHA256: ${backupDigest}`);
  return { backupDigest, ...digests };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  runVerifyPlayBackupCurrent().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
