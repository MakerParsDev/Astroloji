import { cliArgument as argument } from './lib/cli-arguments.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlayClient } from './lib/play-api-client.mjs';
import { loadCanonicalPlayState } from './lib/play-diff.mjs';
import { selectRelevantRelease } from './lib/play-release.mjs';
import {
  backupConfirmation,
  publishPreparedMetadata,
  readBackupFile,
  verifySupportedPublishedState,
} from './lib/play-publication.mjs';

const changesNotSentForReview =
  process.env.PLAY_CHANGES_NOT_SENT_FOR_REVIEW?.toLowerCase() === 'true';


function readLocaleFiles(rootDir) {
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ locale: entry.name, path: path.join(rootDir, entry.name) }))
    .sort((a, b) => a.locale.localeCompare(b.locale));
}

function readTrimmed(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').trim();
}

export function releaseNotesMutation(releaseNotesRoot, releaseNotesTrack, supportedLocales) {
  if (!releaseNotesTrack || !fs.existsSync(releaseNotesRoot)) return async () => {};
  const supported = new Set(supportedLocales ?? []);
  const releaseNotes = readLocaleFiles(releaseNotesRoot)
    .filter(({ locale }) => supported.has(locale))
    .map(({ locale, path: localePath }) => ({
      language: locale,
      text: readTrimmed(path.join(localePath, 'default.txt')),
    }));
  return async (client, editId) => {
    if (releaseNotes.length === 0) return;
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
  metadataRoot = path.resolve(
    repositoryRoot,
    process.env.PLAY_METADATA_ROOT ?? path.join('Astroloji', 'play'),
  ),
  backupPath = argument('backup') ?? process.env.PLAY_METADATA_BACKUP_PATH,
  confirmation = argument('confirmation') ?? process.env.PLAY_METADATA_CONFIRMATION,
  maxAgeMinutes = Number(
    argument('max-backup-age-minutes') ??
      process.env.PLAY_METADATA_BACKUP_MAX_AGE_MINUTES ??
      30,
  ),
  releaseNotesTrack = process.env.PLAY_METADATA_TRACK?.trim(),
  deferReview = changesNotSentForReview,
  fetchImpl = fetch,
  client: injectedClient,
  independentReadback,
  now = new Date(),
} = {}) {
  if (!backupPath) throw new Error('Provide a fresh backup with --backup=<absolute-path>.');
  const resolvedRepositoryRoot = path.resolve(repositoryRoot);
  const resolvedMetadataRoot = path.resolve(metadataRoot);
  const expectedMetadataRoot = path.join(resolvedRepositoryRoot, 'Astroloji', 'play');
  if (resolvedMetadataRoot !== expectedMetadataRoot) {
    throw new Error(`Metadata root must be canonical: ${expectedMetadataRoot}`);
  }

  const { backup, backupDigest } = readBackupFile(path.resolve(backupPath));
  const expectedConfirmation = backupConfirmation(backupDigest);
  if (!confirmation) {
    throw new Error(`Missing publication confirmation. Expected exactly: ${expectedConfirmation}`);
  }

  const proposed = loadCanonicalPlayState(resolvedRepositoryRoot);
  const client = injectedClient ?? createPlayClient({ packageName, credentialsPath, fetchImpl });
  const result = await publishPreparedMetadata({
    client,
    backup,
    backupDigest,
    confirmation,
    proposed,
    now,
    maxAgeMinutes,
    changesNotSentForReview: deferReview,
    additionalEditMutation: releaseNotesMutation(
      path.join(resolvedMetadataRoot, 'release-notes'),
      releaseNotesTrack,
      proposed.locales,
    ),
    independentReadback:
      independentReadback ?? ((state) => verifySupportedPublishedState(client, state)),
  });
  console.log(
    `Published verified Play metadata edit ${result.editId} for ${proposed.locales.length} supported locale(s).`,
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
