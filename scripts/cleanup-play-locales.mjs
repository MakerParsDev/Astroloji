import { cliArgument as argument } from './lib/cli-arguments.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlayClient } from './lib/play-api-client.mjs';
import { capturePlayBackup } from './lib/play-backup.mjs';
import {
  computePlayStateDigest,
  releaseRolloutFraction,
} from './lib/play-diff.mjs';
import {
  assertFreshBackup,
  readBackupFile,
} from './lib/play-publication.mjs';
import { loadStoreConfig } from './lib/play-store-config.mjs';

function sortedLocales(state) {
  return [...(state.listings ?? [])].map((listing) => listing.locale).sort();
}

function normalizeText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

export function cleanupConfirmation(count, stateDigest) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Cleanup removal count must be a positive integer: ${String(count)}`);
  }
  if (!/^[0-9a-f]{64}$/i.test(stateDigest ?? '')) {
    throw new Error('Cleanup state digest must contain 64 hexadecimal characters.');
  }
  return `REMOVE_${count}_UNSUPPORTED_PLAY_LOCALES_${stateDigest.slice(0, 12).toLowerCase()}`;
}

export function buildLocaleCleanupPlan({
  backup,
  current,
  supportedLocales,
  expectedRolloutFraction,
  expectedStateDigest,
  expectedBackupDigest,
  actualBackupDigest,
  expectedRemovalCount,
}) {
  const blockingErrors = [];
  const supported = [...supportedLocales].sort();
  const backupLocales = sortedLocales(backup);
  const currentLocales = sortedLocales(current);
  const stateDigest = computePlayStateDigest(current);
  const backupStateDigest = computePlayStateDigest(backup);
  const localesToRemove = currentLocales.filter((locale) => !supported.includes(locale));
  const missingSupportedLocales = supported.filter((locale) => !currentLocales.includes(locale));
  const liveRolloutFraction = releaseRolloutFraction(current.tracks?.production);

  if (backup.packageName !== current.packageName) {
    blockingErrors.push(
      `Package mismatch: backup=${backup.packageName} current=${current.packageName}.`,
    );
  }
  if (backupLocales.length !== currentLocales.length) {
    blockingErrors.push(
      `Backup locale count differs from current live locale count: ` +
        `backup=${backupLocales.length} current=${currentLocales.length}.`,
    );
  }
  if (backupStateDigest !== stateDigest) {
    blockingErrors.push('Backup state differs from current live state. Capture a new backup.');
  }
  if (actualBackupDigest !== expectedBackupDigest) {
    blockingErrors.push(
      `Backup checksum mismatch: actual=${actualBackupDigest} expected=${expectedBackupDigest}.`,
    );
  }
  if (stateDigest !== expectedStateDigest) {
    blockingErrors.push(
      `Live state digest mismatch: actual=${stateDigest} expected=${expectedStateDigest}.`,
    );
  }
  if (missingSupportedLocales.length > 0) {
    blockingErrors.push(
      `Required supported locale is absent: ${missingSupportedLocales.join(', ')}.`,
    );
  }
  if (localesToRemove.length !== expectedRemovalCount) {
    blockingErrors.push(
      `Removal count mismatch: actual=${localesToRemove.length} expected=${expectedRemovalCount}.`,
    );
  }
  if (liveRolloutFraction !== expectedRolloutFraction) {
    blockingErrors.push(
      `Production rollout mismatch: live=${String(liveRolloutFraction)} ` +
        `expected=${expectedRolloutFraction}.`,
    );
  }

  return {
    schemaVersion: 1,
    packageName: current.packageName,
    supportedLocales: supported,
    backupLocaleCount: backupLocales.length,
    liveLocaleCount: currentLocales.length,
    localesToRemove,
    removalCount: localesToRemove.length,
    stateDigest,
    backupStateDigest,
    backupDigest: actualBackupDigest,
    liveRolloutFraction,
    expectedRolloutFraction,
    blockingErrors,
    confirmation:
      blockingErrors.length === 0 && localesToRemove.length > 0
        ? cleanupConfirmation(localesToRemove.length, stateDigest)
        : null,
  };
}

function sameArray(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

async function assertSupportedListingsIntact(client, editId, current, supportedLocales) {
  const currentByLocale = new Map(current.listings.map((listing) => [listing.locale, listing]));
  for (const locale of supportedLocales) {
    const expected = currentByLocale.get(locale);
    const actual = await client.getListing(editId, locale);
    for (const field of ['title', 'shortDescription', 'fullDescription']) {
      if (normalizeText(actual[field]) !== normalizeText(expected[field])) {
        throw new Error(`Supported listing changed during cleanup: ${locale}/${field}.`);
      }
    }
  }
}

export async function executeLocaleCleanup({
  client,
  current,
  plan,
  confirmation,
  independentReadback,
  changesNotSentForReview = false,
}) {
  if (plan.blockingErrors.length > 0) {
    throw new Error(`Locale cleanup blocked: ${plan.blockingErrors.join(' | ')}`);
  }
  if (!plan.confirmation || confirmation !== plan.confirmation) {
    throw new Error(`Cleanup confirmation mismatch. Expected exactly: ${plan.confirmation}`);
  }
  if (client.packageName !== current.packageName || client.packageName !== plan.packageName) {
    throw new Error('Cleanup package mismatch between client, current state, and plan.');
  }
  if (typeof independentReadback !== 'function') {
    throw new Error('Locale cleanup requires an independent read-back function.');
  }

  const frozenLiveLocales = sortedLocales(current);
  const edit = await client.createEdit();
  let committed = false;
  try {
    const editLocalesBefore = (await client.listListings(edit.id))
      .map((listing) => listing.language)
      .sort();
    if (!sameArray(editLocalesBefore, frozenLiveLocales)) {
      throw new Error('Cleanup edit listing set differs from the frozen live state.');
    }

    for (const locale of plan.localesToRemove) {
      await client.deleteListing(edit.id, locale);
    }

    const editLocalesAfter = (await client.listListings(edit.id))
      .map((listing) => listing.language)
      .sort();
    if (!sameArray(editLocalesAfter, plan.supportedLocales)) {
      throw new Error(
        `Cleanup edit must contain exactly supported locales: ${plan.supportedLocales.join(', ')}.`,
      );
    }
    await assertSupportedListingsIntact(
      client,
      edit.id,
      current,
      plan.supportedLocales,
    );

    await client.commitEdit(edit.id, {
      changesNotSentForReview,
      changesInReviewBehavior: 'ERROR_IF_IN_REVIEW',
    });
    committed = true;
    const readbackErrors = await independentReadback(plan);
    if (readbackErrors.length > 0) {
      throw new Error(`Post-cleanup Play read-back failed: ${readbackErrors.join(' | ')}`);
    }
    return { editId: edit.id, removedLocales: plan.localesToRemove };
  } finally {
    if (!committed) await client.deleteEdit(edit.id);
  }
}


function verifyCleanupReadback(current, supportedLocales, expectedRolloutFraction) {
  return async (plan) => {
    const errors = [];
    const liveLocales = sortedLocales(current);
    if (!sameArray(liveLocales, supportedLocales)) {
      errors.push(
        `Live locales after cleanup are ${liveLocales.join(', ')}, expected ${supportedLocales.join(', ')}.`,
      );
    }
    const rollout = releaseRolloutFraction(current.tracks?.production);
    if (rollout !== expectedRolloutFraction) {
      errors.push(`Production rollout changed after cleanup: ${String(rollout)}.`);
    }
    if (plan.removalCount < 1) errors.push('Cleanup plan removed no locales.');
    return errors;
  };
}

export async function runCleanupCli({
  packageName = process.env.PLAY_PACKAGE_NAME,
  credentialsPath = process.env.PLAY_SERVICE_ACCOUNT_JSON_PATH,
  repositoryRoot = process.cwd(),
  backupPath = argument('backup'),
  expectedBackupDigest = argument('backup-sha256'),
  expectedStateDigest = argument('state-digest'),
  expectedRemovalCountValue = argument('removal-count'),
  confirmation = argument('confirmation'),
  maxAgeMinutes = Number(argument('max-backup-age-minutes') ?? 30),
  deferReview = process.env.PLAY_CHANGES_NOT_SENT_FOR_REVIEW?.toLowerCase() === 'true',
  fetchImpl = fetch,
  client: injectedClient,
} = {}) {
  if (!backupPath) throw new Error('Provide --backup=<absolute-path>.');
  const storeConfig = loadStoreConfig(path.resolve(repositoryRoot));
  const { backup, backupDigest } = readBackupFile(path.resolve(backupPath));
  assertFreshBackup(backup, { maxAgeMinutes });
  const client = injectedClient ?? createPlayClient({ packageName, credentialsPath, fetchImpl });
  const current = await capturePlayBackup(client);
  const currentStateDigest = computePlayStateDigest(current);
  const actualRemovalCount = sortedLocales(current)
    .filter((locale) => !storeConfig.locales.includes(locale)).length;

  if (
    confirmation &&
    (!expectedBackupDigest || !expectedStateDigest || expectedRemovalCountValue === undefined)
  ) {
    throw new Error(
      'Applying cleanup requires --backup-sha256, --state-digest, and --removal-count.',
    );
  }

  const expectedRemovalCount = expectedRemovalCountValue === undefined
    ? actualRemovalCount
    : Number(expectedRemovalCountValue);
  const plan = buildLocaleCleanupPlan({
    backup,
    current,
    supportedLocales: storeConfig.locales,
    expectedRolloutFraction: storeConfig.productionRolloutFraction,
    expectedStateDigest: expectedStateDigest ?? currentStateDigest,
    expectedBackupDigest: expectedBackupDigest ?? backupDigest,
    actualBackupDigest: backupDigest,
    expectedRemovalCount,
  });

  console.log(`CLEANUP BACKUP SHA256: ${backupDigest}`);
  console.log(`CLEANUP LIVE STATE SHA256: ${plan.stateDigest}`);
  console.log(`CLEANUP REMOVAL COUNT: ${plan.removalCount}`);
  for (const locale of plan.localesToRemove) console.log(`REMOVE LOCALE: ${locale}`);
  for (const error of plan.blockingErrors) console.error(`CLEANUP BLOCKER: ${error}`);
  if (plan.confirmation) console.log(`REQUIRED CONFIRMATION: ${plan.confirmation}`);

  if (plan.blockingErrors.length > 0) {
    process.exitCode = 2;
    return { dryRun: true, plan };
  }
  if (!confirmation) return { dryRun: true, plan };

  const result = await executeLocaleCleanup({
    client,
    current,
    plan,
    confirmation,
    changesNotSentForReview: deferReview,
    independentReadback: async () => {
      const after = await capturePlayBackup(client);
      return verifyCleanupReadback(
        after,
        storeConfig.locales,
        storeConfig.productionRolloutFraction,
      )(plan);
    },
  });
  console.log(
    `Removed ${result.removedLocales.length} unsupported Play locales in edit ${result.editId}.`,
  );
  return { dryRun: false, plan, ...result };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCleanupCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
