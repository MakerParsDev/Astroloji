import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlayClient } from './lib/play-api-client.mjs';

const changesNotSentForReview =
  process.env.PLAY_CHANGES_NOT_SENT_FOR_REVIEW?.toLowerCase() === 'true';

function readLocaleFiles(rootDir) {
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      locale: entry.name,
      path: path.join(rootDir, entry.name),
    }))
    .sort((a, b) => a.locale.localeCompare(b.locale));
}

function readTrimmed(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').trim();
}

export async function publishPlayMetadata({
  packageName = process.env.PLAY_PACKAGE_NAME,
  credentialsPath = process.env.PLAY_SERVICE_ACCOUNT_JSON_PATH,
  metadataRoot = path.resolve(
    process.cwd(),
    process.env.PLAY_METADATA_ROOT ?? path.join('Astroloji', 'play'),
  ),
  releaseNotesTrack = process.env.PLAY_METADATA_TRACK?.trim(),
  deferReview = changesNotSentForReview,
  fetchImpl = fetch,
} = {}) {
  const listingsRoot = path.join(metadataRoot, 'listings');
  const releaseNotesRoot = path.join(metadataRoot, 'release-notes');
  if (!fs.existsSync(listingsRoot)) {
    throw new Error(`Missing listings directory: ${listingsRoot}`);
  }

  const listings = readLocaleFiles(listingsRoot);
  if (listings.length === 0) {
    throw new Error(`No listings found under ${listingsRoot}`);
  }

  const client = createPlayClient({ packageName, credentialsPath, fetchImpl });
  const edit = await client.createEdit();
  let committed = false;

  try {
    for (const listing of listings) {
      await client.updateListing(edit.id, listing.locale, {
        language: listing.locale,
        title: readTrimmed(path.join(listing.path, 'title.txt')),
        shortDescription: readTrimmed(path.join(listing.path, 'short-description.txt')),
        fullDescription: readTrimmed(path.join(listing.path, 'full-description.txt')),
      });
    }

    if (releaseNotesTrack && fs.existsSync(releaseNotesRoot)) {
      const releaseNotes = readLocaleFiles(releaseNotesRoot).map(({ locale, path: localePath }) => ({
        language: locale,
        text: readTrimmed(path.join(localePath, 'default.txt')),
      }));

      if (releaseNotes.length > 0) {
        const track = await client.getTrack(edit.id, releaseNotesTrack);
        if (!track.releases?.length) {
          throw new Error(`Track '${releaseNotesTrack}' has no releases to attach release notes to.`);
        }
        const [primaryRelease, ...otherReleases] = track.releases;
        await client.updateTrack(edit.id, releaseNotesTrack, {
          ...track,
          releases: [
            {
              ...primaryRelease,
              releaseNotes,
            },
            ...otherReleases,
          ],
        });
      }
    }

    await client.commitEdit(edit.id, { changesNotSentForReview: deferReview });
    committed = true;
    console.log(`Published Play metadata edit ${edit.id} for ${listings.length} locale(s).`);
    return { editId: edit.id, localeCount: listings.length };
  } finally {
    if (!committed) {
      try {
        await client.deleteEdit(edit.id);
      } catch {
        console.error(`Unable to abandon uncommitted Play edit ${edit.id}; inspect it before retrying.`);
      }
    }
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  publishPlayMetadata().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
