import { cliArgument as argument } from './lib/cli-arguments.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlayClient } from './lib/play-api-client.mjs';
import { capturePlayBackup } from './lib/play-backup.mjs';
import { loadCanonicalPlayState } from './lib/play-diff.mjs';
import { selectRelevantRelease } from './lib/play-release.mjs';
import {
  assertBackupMatchesLiveState,
  backupConfirmation,
  publishPreparedMetadata,
  readBackupFile,
  verifySupportedPublishedState,
} from './lib/play-publication.mjs';

const changesNotSentForReview =
  process.env.PLAY_CHANGES_NOT_SENT_FOR_REVIEW?.toLowerCase() === 'true';

export function parseImageScope(value) {
  if (value !== 'phoneScreenshots') {
    throw new Error('Provide --image-scope phoneScreenshots exactly for screenshot publication.');
  }
  return new Set(['phoneScreenshots']);
}


function readLocaleFiles(rootDir) {
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ locale: entry.name, path: path.join(rootDir, entry.name) }))
    .sort((a, b) => a.locale.localeCompare(b.locale));
}

function readTrimmed(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').trim();
}

export function releaseNotesMutation(
  releaseNotesRoot,
  releaseNotesTrack,
  supportedLocales,
  log = console.log,
) {
  if (!releaseNotesTrack) {
    return async () => log('Release notes skipped: PLAY_METADATA_TRACK is not set.');
  }
  if (!fs.existsSync(releaseNotesRoot)) {
    return async () => log(`Release notes skipped: release-note root does not exist: ${releaseNotesRoot}`);
  }
  const supported = new Set(supportedLocales ?? []);
  const releaseNotes = readLocaleFiles(releaseNotesRoot)
    .filter(({ locale }) => supported.has(locale))
    .map(({ locale, path: localePath }) => ({
      language: locale,
      text: readTrimmed(path.join(localePath, 'default.txt')),
    }));
  return async (client, editId) => {
    if (releaseNotes.length === 0) {
      log('Release notes skipped: no supported locale release notes were found.');
      return;
    }
    const track = await client.getTrack(editId, releaseNotesTrack);
    if (!track.releases?.length) {
      throw new Error(`Track '${releaseNotesTrack}' has no releases to attach release notes to.`);
    }
    const target = selectRelevantRelease(track);
    if (!target) {
      throw new Error(`Track '${releaseNotesTrack}' has no staged or completed release to attach release notes to.`);
    }
    const targetIndex = track.releases.indexOf(target);
    const releases = track.releases.map((release, index) =>
      index === targetIndex ? { ...release, releaseNotes } : release,
    );
    await client.updateTrack(editId, releaseNotesTrack, { ...track, releases });
  };
}

export async function publishPlayMetadata({
  packageName = process.env.PLAY_PACKAGE_NAME,
  credentialsPath = process.env.PLAY_SERVICE_ACCOUNT_JSON_PATH,
  repositoryRoot = process.cwd(),
  backupPath = argument('backup') ?? process.env.PLAY_METADATA_BACKUP_PATH,
  confirmation = argument('confirmation') ?? process.env.PLAY_METADATA_CONFIRMATION,
  imageScope = argument('image-scope'),
  maxAgeMinutes = Number(
    argument('max-backup-age-minutes') ??
      process.env.PLAY_METADATA_BACKUP_MAX_AGE_MINUTES ??
      30,
  ),
  deferReview = changesNotSentForReview,
  fetchImpl = fetch,
  client: injectedClient,
  independentReadback,
  captureCurrentState = (playClient, options) => capturePlayBackup(playClient, options),
  now = new Date(),
} = {}) {
  if (!backupPath) throw new Error('Provide a fresh backup with --backup=<absolute-path>.');
  const imageTypes = parseImageScope(imageScope);
  const resolvedRepositoryRoot = path.resolve(repositoryRoot);

  const { backup, backupDigest } = readBackupFile(path.resolve(backupPath));
  const expectedConfirmation = backupConfirmation(backupDigest);
  if (!confirmation) {
    throw new Error(`Missing publication confirmation. Expected exactly: ${expectedConfirmation}`);
  }

  const proposed = loadCanonicalPlayState(resolvedRepositoryRoot);
  const client = injectedClient ?? createPlayClient({ packageName, credentialsPath, fetchImpl });
  const current = await captureCurrentState(client, { defaultLocale: backup.defaultLocale });
  assertBackupMatchesLiveState(backup, current);
  const result = await publishPreparedMetadata({
    client,
    backup,
    backupDigest,
    confirmation,
    proposed,
    imageTypes,
    now,
    maxAgeMinutes,
    changesNotSentForReview: deferReview,
    independentReadback:
      independentReadback ??
      ((state) => verifySupportedPublishedState(client, state, { imageTypes, baseline: backup })),
  });
  console.log(
    `Published verified Play phone screenshots edit ${result.editId} for ${proposed.locales.length} supported locale(s).`,
  );
  return { ...result, backupDigest };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  publishPlayMetadata().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
