import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createPlayClient } from './lib/play-api-client.mjs';
import { capturePlayBackup } from './lib/play-backup.mjs';
import { buildPlayDiff, computePlayStateDigest, loadCanonicalPlayState } from './lib/play-diff.mjs';
import {
  backupConfirmation,
  publishPreparedMetadata,
  restoreConfirmation,
  restorePreparedMetadata,
  verifyBackupRestoredState,
  verifySupportedPublishedState,
} from './lib/play-publication.mjs';

function hasSupportedMetadataChanges(diff) {
  if (diff.missingLiveLocales.length > 0) return true;
  for (const locale of diff.supportedLocales) {
    if (Object.values(diff.listings[locale]).some((status) => status !== 'UNCHANGED')) return true;
    if (Object.values(diff.images[locale]).some((image) => image.status !== 'UNCHANGED')) return true;
  }
  return false;
}

export function classifyMetadataReconciliation(diff) {
  if (diff.blockingErrors.length > 0) {
    return { action: 'hold', reason: diff.blockingErrors.join(' | ') };
  }
  if (diff.extraLiveLocales.length > 0) {
    return {
      action: 'hold',
      reason: `Unexpected live locales require a separate cleanup pass: ${diff.extraLiveLocales.join(', ')}`,
    };
  }
  return hasSupportedMetadataChanges(diff)
    ? { action: 'publish', reason: 'Canonical Play metadata differs from live state.' }
    : { action: 'hold', reason: 'Canonical Play metadata already matches live state.' };
}

function backupDigest(backup) {
  return crypto.createHash('sha256').update(JSON.stringify(backup)).digest('hex');
}

async function restoreIfLiveChanged({ client, backup, digest }) {
  const current = await capturePlayBackup(client, { defaultLocale: backup.defaultLocale });
  if (computePlayStateDigest(current) === computePlayStateDigest(backup)) {
    return { restored: false, reason: 'Live Play state still matches the pre-publication backup.' };
  }
  await restorePreparedMetadata({
    client,
    backup,
    backupDigest: digest,
    confirmation: restoreConfirmation(digest),
    independentReadback: (state) => verifyBackupRestoredState(client, state),
    changesNotSentForReview: false,
  });
  return { restored: true, reason: 'Live Play state was restored from the pre-publication backup.' };
}

export async function reconcilePlayMetadata({
  packageName = process.env.PLAY_PACKAGE_NAME,
  credentialsPath = process.env.PLAY_SERVICE_ACCOUNT_JSON_PATH,
  repositoryRoot = process.cwd(),
  fetchImpl = fetch,
  client: injectedClient,
} = {}) {
  if (!packageName) throw new Error('PLAY_PACKAGE_NAME is required.');
  if (!credentialsPath && !injectedClient) throw new Error('PLAY_SERVICE_ACCOUNT_JSON_PATH is required.');

  const root = path.resolve(repositoryRoot);
  const client = injectedClient ?? createPlayClient({ packageName, credentialsPath, fetchImpl });
  const proposed = loadCanonicalPlayState(root);
  const backup = await capturePlayBackup(client, { defaultLocale: proposed.defaultLocale });
  const diff = buildPlayDiff(backup, proposed);
  const decision = classifyMetadataReconciliation(diff);
  if (decision.action !== 'publish') {
    return { ...decision, diff };
  }

  const digest = backupDigest(backup);
  try {
    const result = await publishPreparedMetadata({
      client,
      backup,
      backupDigest: digest,
      confirmation: backupConfirmation(digest),
      proposed,
      independentReadback: (state, options) =>
        verifySupportedPublishedState(client, state, options),
      changesNotSentForReview: false,
    });
    return { action: 'published', reason: decision.reason, diff, editId: result.editId };
  } catch (error) {
    const restore = await restoreIfLiveChanged({ client, backup, digest });
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message} Recovery: ${restore.reason}`);
  }
}

async function main() {
  const result = await reconcilePlayMetadata();
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
