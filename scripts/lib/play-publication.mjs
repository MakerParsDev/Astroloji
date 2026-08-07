import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { capturePlayBackup } from './play-backup.mjs';
import { abandonEdit } from './play-edit.mjs';
import { buildPlayDiff, computePlayStateDigest, IMAGE_TYPES } from './play-diff.mjs';
import { releaseRolloutFraction } from './play-release.mjs';

const CONFIRMATION_PREFIX_LENGTH = 12;
const DEFAULT_MAX_BACKUP_AGE_MINUTES = 30;
const DEFAULT_IMAGE_DOWNLOAD_TIMEOUT_MS = 60_000;

function normalizePublicationImageTypes(imageTypes = new Set(IMAGE_TYPES)) {
  if (!(imageTypes instanceof Set) || imageTypes.size === 0) {
    throw new Error('Publication imageTypes must be a non-empty Set.');
  }
  const normalized = new Set(imageTypes);
  const invalid = [...normalized].filter((imageType) => !IMAGE_TYPES.includes(imageType));
  if (invalid.length > 0) {
    throw new Error(`Unsupported publication image type(s): ${invalid.join(', ')}`);
  }
  const isFullState =
    normalized.size === IMAGE_TYPES.length && IMAGE_TYPES.every((imageType) => normalized.has(imageType));
  const isPhoneOnly = normalized.size === 1 && normalized.has('phoneScreenshots');
  if (!isFullState && !isPhoneOnly) {
    throw new Error('Publication imageTypes must be the full image set or exactly phoneScreenshots.');
  }
  return normalized;
}

function isPhoneOnlyImageScope(imageTypes) {
  return imageTypes.size === 1 && imageTypes.has('phoneScreenshots');
}

function normalizeText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function expectedConfirmation(prefix, backupDigest) {
  if (!/^[0-9a-f]{64}$/i.test(backupDigest ?? '')) {
    throw new Error('Backup SHA-256 digest must contain 64 hexadecimal characters.');
  }
  return `${prefix}_${backupDigest.slice(0, CONFIRMATION_PREFIX_LENGTH).toLowerCase()}`;
}

export function backupConfirmation(backupDigest) {
  return expectedConfirmation('PUBLISH_TR_EN_METADATA', backupDigest);
}

export function restoreConfirmation(backupDigest) {
  return expectedConfirmation('RESTORE_PLAY_METADATA', backupDigest);
}

export function assertFreshBackup(
  backup,
  { now = new Date(), maxAgeMinutes = DEFAULT_MAX_BACKUP_AGE_MINUTES } = {},
) {
  const capturedAt = new Date(backup?.capturedAt ?? '');
  if (Number.isNaN(capturedAt.getTime())) {
    throw new Error('Play backup capturedAt is missing or invalid.');
  }
  if (!Number.isFinite(maxAgeMinutes) || maxAgeMinutes <= 0) {
    throw new Error(`Invalid backup publication window: ${String(maxAgeMinutes)} minutes.`);
  }
  const ageMillis = now.getTime() - capturedAt.getTime();
  if (ageMillis < -60_000) {
    throw new Error('Play backup capturedAt is unexpectedly in the future.');
  }
  if (ageMillis > maxAgeMinutes * 60_000) {
    throw new Error(
      `Play backup is stale: age_minutes=${(ageMillis / 60_000).toFixed(1)} max=${maxAgeMinutes}.`,
    );
  }
}

function assertConfirmation(actual, expected) {
  if (actual !== expected) {
    throw new Error(`Confirmation mismatch. Expected exactly: ${expected}`);
  }
}

function assertPackageAgreement(client, backup, proposed) {
  const packageNames = [client.packageName, backup.packageName, proposed.packageName];
  if (packageNames.some((value) => typeof value !== 'string' || !value.trim())) {
    throw new Error('Missing package identity across client, backup, or proposal.');
  }
  if (new Set(packageNames).size !== 1) {
    throw new Error(`Package mismatch across client, backup, and proposal: ${packageNames.join(', ')}`);
  }
}

function normalizedSha256(image, context) {
  const value = String(image?.sha256 ?? '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${context} requires a valid SHA-256 value.`);
  }
  return value;
}

function sortedHashes(images, context) {
  return [...(images ?? [])]
    .map((image, index) => normalizedSha256(image, `${context}[${index}]`))
    .sort();
}

function assertProposedImageHashes(proposed, imageTypes = new Set(IMAGE_TYPES)) {
  for (const locale of proposed.locales ?? []) {
    for (const imageType of imageTypes) {
      sortedHashes(proposed.listings?.[locale]?.images?.[imageType] ?? [], `${locale}/${imageType}`);
    }
  }
}

export function assertBackupMatchesLiveState(backup, current) {
  if (!backup?.packageName || !current?.packageName || backup.packageName !== current.packageName) {
    throw new Error('Approved backup package does not match the fresh live Play state.');
  }
  const backupStateDigest = computePlayStateDigest(backup);
  const liveStateDigest = computePlayStateDigest(current);
  if (backupStateDigest !== liveStateDigest) {
    throw new Error(
      'Live Play state changed since the approved backup. Capture a new backup and obtain fresh approval.',
    );
  }
  return { backupStateDigest, liveStateDigest };
}

export function assertBackupRestorable(backup) {
  if (typeof backup?.defaultLocale !== 'string' || !backup.defaultLocale.trim()) {
    throw new Error('Play backup defaultLocale is required for restore verification.');
  }
  if (!backup.listings?.some((listing) => listing.locale === backup.defaultLocale)) {
    throw new Error(`Play backup defaultLocale is missing from listings: ${backup.defaultLocale}`);
  }
  for (const listing of backup.listings ?? []) {
    for (const imageType of IMAGE_TYPES) {
      sortedHashes(listing.images?.[imageType] ?? [], `backup ${listing.locale}/${imageType}`);
    }
  }
}

async function verifyEditLocalState(client, editId, proposed, imageTypes = new Set(IMAGE_TYPES)) {
  const normalizedImageTypes = normalizePublicationImageTypes(imageTypes);
  const phoneOnly = isPhoneOnlyImageScope(normalizedImageTypes);
  for (const locale of proposed.locales) {
    const expectedListing = proposed.listings[locale];
    if (!phoneOnly) {
      const actualListing = await client.getListing(editId, locale);
      for (const field of ['title', 'shortDescription', 'fullDescription']) {
        if (normalizeText(actualListing[field]) !== normalizeText(expectedListing[field])) {
          throw new Error(`Edit-local listing verification failed for ${locale}/${field}.`);
        }
      }
    }

    for (const imageType of normalizedImageTypes) {
      const expectedImages = expectedListing.images[imageType] ?? [];
      const actualImages = await client.listImages(editId, locale, imageType);
      if (actualImages.length !== expectedImages.length) {
        throw new Error(
          `Edit-local image count mismatch for ${locale}/${imageType}: ` +
            `actual=${actualImages.length} expected=${expectedImages.length}.`,
        );
      }
      if (
        JSON.stringify(sortedHashes(actualImages, `actual ${locale}/${imageType}`)) !==
        JSON.stringify(sortedHashes(expectedImages, `expected ${locale}/${imageType}`))
      ) {
        throw new Error(`Edit-local image checksum mismatch for ${locale}/${imageType}.`);
      }
    }
  }
}

async function applyProposedState(client, editId, proposed, imageTypes = new Set(IMAGE_TYPES)) {
  const normalizedImageTypes = normalizePublicationImageTypes(imageTypes);
  const phoneOnly = isPhoneOnlyImageScope(normalizedImageTypes);
  for (const locale of proposed.locales) {
    const listing = proposed.listings[locale];
    if (!phoneOnly) {
      await client.updateListing(editId, locale, {
        language: locale,
        title: listing.title,
        shortDescription: listing.shortDescription,
        fullDescription: listing.fullDescription,
      });
    }

    for (const imageType of normalizedImageTypes) {
      await client.deleteAllImages(editId, locale, imageType);
      for (const image of listing.images[imageType] ?? []) {
        await client.uploadImage(editId, locale, imageType, image.filePath);
      }
    }
  }
}

export async function publishPreparedMetadata({
  client,
  backup,
  backupDigest,
  confirmation,
  proposed,
  imageTypes = new Set(IMAGE_TYPES),
  now = new Date(),
  maxAgeMinutes = DEFAULT_MAX_BACKUP_AGE_MINUTES,
  independentReadback,
  additionalEditMutation = async () => {},
  changesNotSentForReview = false,
}) {
  assertPackageAgreement(client, backup, proposed);
  const normalizedImageTypes = normalizePublicationImageTypes(imageTypes);
  const phoneOnly = isPhoneOnlyImageScope(normalizedImageTypes);
  assertProposedImageHashes(proposed, normalizedImageTypes);
  assertFreshBackup(backup, { now, maxAgeMinutes });
  assertConfirmation(confirmation, backupConfirmation(backupDigest));
  const diff = buildPlayDiff(backup, proposed);
  if (diff.blockingErrors.length > 0) {
    throw new Error(`Publication blocked: ${diff.blockingErrors.join(' | ')}`);
  }
  if (typeof independentReadback !== 'function') {
    throw new Error('Publication requires an independent read-back function.');
  }

  const edit = await client.createEdit();
  let committed = false;
  try {
    await applyProposedState(client, edit.id, proposed, normalizedImageTypes);
    if (!phoneOnly) {
      await additionalEditMutation(client, edit.id);
    }
    await verifyEditLocalState(client, edit.id, proposed, normalizedImageTypes);
    await client.commitEdit(edit.id, {
      changesNotSentForReview,
      changesInReviewBehavior: 'ERROR_IF_IN_REVIEW',
    });
    committed = true;

    const readbackErrors = await independentReadback(proposed, {
      imageTypes: normalizedImageTypes,
      baseline: backup,
    });
    if (readbackErrors.length > 0) {
      throw new Error(`Committed edit ${edit.id} but post-commit Play read-back failed: ${readbackErrors.join(' | ')}. Restore from the approved backup before retrying.`);
    }
    return { editId: edit.id, diff };
  } finally {
    if (!committed) {
      await abandonEdit(client, edit.id);
    }
  }
}

function temporaryImageExtension(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  return pathname.endsWith('.jpg') || pathname.endsWith('.jpeg') ? '.jpg' : '.png';
}

async function downloadBackupImage(fetchImpl, image, directory, index, timeoutMs) {
  const expectedSha256 = normalizedSha256(image, `backup image ${index}`);
  if (!image.url) throw new Error('Backed-up Play image is missing its download URL.');
  const response = await fetchImpl(image.url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`Unable to download backed-up Play image (${response.status}).`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const actualSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actualSha256.toLowerCase() !== expectedSha256) {
    throw new Error(`Backed-up Play image checksum mismatch for ${image.url}.`);
  }
  const filePath = path.join(directory, `${String(index).padStart(3, '0')}${temporaryImageExtension(image.url)}`);
  fs.writeFileSync(filePath, bytes, { mode: 0o600 });
  return filePath;
}

async function applyBackupState(client, editId, backup, fetchImpl, imageDownloadTimeoutMs) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-play-assets-'));
  fs.chmodSync(temporaryDirectory, 0o700);
  try {
    for (const listing of [...backup.listings].sort((a, b) => a.locale.localeCompare(b.locale))) {
      await client.updateListing(editId, listing.locale, {
        language: listing.locale,
        title: listing.title,
        shortDescription: listing.shortDescription,
        fullDescription: listing.fullDescription,
        ...(listing.video ? { video: listing.video } : {}),
      });
      for (const imageType of IMAGE_TYPES) {
        await client.deleteAllImages(editId, listing.locale, imageType);
        const images = listing.images?.[imageType] ?? [];
        for (let index = 0; index < images.length; index += 1) {
          const filePath = await downloadBackupImage(
            fetchImpl,
            images[index],
            temporaryDirectory,
            index,
            imageDownloadTimeoutMs,
          );
          await client.uploadImage(editId, listing.locale, imageType, filePath);
        }
      }
    }
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

async function verifyRestoredEdit(client, editId, backup) {
  for (const listing of backup.listings) {
    const actualListing = await client.getListing(editId, listing.locale);
    for (const field of ['title', 'shortDescription', 'fullDescription']) {
      if (normalizeText(actualListing[field]) !== normalizeText(listing[field])) {
        throw new Error(`Restore listing verification failed for ${listing.locale}/${field}.`);
      }
    }
    for (const imageType of IMAGE_TYPES) {
      const actualImages = await client.listImages(editId, listing.locale, imageType);
      const expectedImages = listing.images?.[imageType] ?? [];
      if (actualImages.length !== expectedImages.length) {
        throw new Error(`Restore image count mismatch for ${listing.locale}/${imageType}.`);
      }
      if (
        JSON.stringify(sortedHashes(actualImages, `actual ${listing.locale}/${imageType}`)) !==
        JSON.stringify(sortedHashes(expectedImages, `expected ${listing.locale}/${imageType}`))
      ) {
        throw new Error(`Restore image checksum mismatch for ${listing.locale}/${imageType}.`);
      }
    }
  }
}

export async function restorePreparedMetadata({
  client,
  backup,
  backupDigest,
  confirmation,
  fetchImpl = fetch,
  independentReadback,
  imageDownloadTimeoutMs = DEFAULT_IMAGE_DOWNLOAD_TIMEOUT_MS,
  additionalEditMutation = async () => {},
  changesNotSentForReview = false,
}) {
  if (!client.packageName || !backup.packageName) {
    throw new Error('Missing package identity for restore.');
  }
  if (client.packageName !== backup.packageName) {
    throw new Error(`Restore package mismatch: client=${client.packageName} backup=${backup.packageName}.`);
  }
  assertBackupRestorable(backup);
  assertConfirmation(confirmation, restoreConfirmation(backupDigest));
  if (typeof independentReadback !== 'function') {
    throw new Error('Restore requires an independent read-back function.');
  }
  if (!Number.isFinite(imageDownloadTimeoutMs) || imageDownloadTimeoutMs <= 0) {
    throw new Error('Restore image download timeout must be a positive finite number.');
  }
  const edit = await client.createEdit();
  let committed = false;
  try {
    await applyBackupState(client, edit.id, backup, fetchImpl, imageDownloadTimeoutMs);
    await verifyRestoredEdit(client, edit.id, backup);
    await client.commitEdit(edit.id, {
      changesNotSentForReview,
      changesInReviewBehavior: 'ERROR_IF_IN_REVIEW',
    });
    committed = true;
    const errors = await independentReadback(backup);
    if (errors.length > 0) {
      throw new Error(`Post-restore Play read-back failed: ${errors.join(' | ')}`);
    }
    return { editId: edit.id };
  } finally {
    if (!committed) {
      await abandonEdit(client, edit.id);
    }
  }
}

export function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}


export function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function readBackupFile(filePath) {
  const raw = fs.readFileSync(filePath);
  let backup;
  try {
    backup = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new Error(`Play backup is not valid JSON: ${filePath}`);
  }
  return {
    backup,
    backupDigest: crypto.createHash('sha256').update(raw).digest('hex'),
  };
}

function backupAsProposed(backup) {
  const listings = Object.fromEntries(
    backup.listings.map((listing) => [
      listing.locale,
      {
        title: listing.title,
        shortDescription: listing.shortDescription,
        fullDescription: listing.fullDescription,
        images: listing.images,
      },
    ]),
  );
  return {
    packageName: backup.packageName,
    defaultLocale: backup.defaultLocale,
    locales: backup.listings.map((listing) => listing.locale).sort(),
    listings,
    productionRolloutFraction: releaseRolloutFraction(backup.tracks?.production),
    subscriptions: backup.subscriptions.flatMap((subscription) =>
      (subscription.basePlans ?? []).map((basePlan) => ({
        productId: subscription.productId,
        basePlanId: basePlan.basePlanId,
      })),
    ),
  };
}

function supportedContentErrors(diff) {
  const errors = [...diff.blockingErrors];
  if (diff.missingLiveLocales.length > 0) {
    errors.push(`Missing supported locales: ${diff.missingLiveLocales.join(', ')}`);
  }
  for (const locale of diff.supportedLocales) {
    for (const [field, status] of Object.entries(diff.listings[locale])) {
      if (status !== 'UNCHANGED') errors.push(`Listing drift: ${locale}/${field}=${status}`);
    }
    for (const [imageType, image] of Object.entries(diff.images[locale])) {
      if (image.status !== 'UNCHANGED') {
        errors.push(
          `Image drift: ${locale}/${imageType}=${image.before}->${image.after}`,
        );
      }
    }
  }
  return errors;
}

function scopedExpectedPublishedState(proposed, baseline, imageTypes) {
  const normalizedImageTypes = normalizePublicationImageTypes(imageTypes);
  if (!isPhoneOnlyImageScope(normalizedImageTypes)) return proposed;
  if (!baseline) {
    throw new Error('Phone screenshot read-back requires the approved backup baseline.');
  }
  const expected = backupAsProposed(baseline);
  for (const locale of proposed.locales) {
    if (!expected.listings[locale]) {
      throw new Error(`Approved backup is missing supported locale ${locale}.`);
    }
    expected.listings[locale].images.phoneScreenshots =
      proposed.listings[locale].images.phoneScreenshots;
  }
  return expected;
}

export async function verifySupportedPublishedState(
  client,
  proposed,
  { imageTypes = new Set(IMAGE_TYPES), baseline } = {},
) {
  const live = await capturePlayBackup(client);
  const expected = scopedExpectedPublishedState(proposed, baseline, imageTypes);
  return supportedContentErrors(buildPlayDiff(live, expected));
}

export async function verifyBackupRestoredState(client, backup) {
  const live = await capturePlayBackup(client);
  const proposed = backupAsProposed(backup);
  const diff = buildPlayDiff(live, proposed);
  const errors = supportedContentErrors(diff);
  if (diff.extraLiveLocales.length > 0) {
    errors.push(`Unexpected locales after restore: ${diff.extraLiveLocales.join(', ')}`);
  }
  return errors;
}

export { DEFAULT_IMAGE_DOWNLOAD_TIMEOUT_MS, DEFAULT_MAX_BACKUP_AGE_MINUTES, verifyEditLocalState };
