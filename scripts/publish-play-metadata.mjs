import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const packageName = process.env.PLAY_PACKAGE_NAME;
const credentialsPath = process.env.PLAY_SERVICE_ACCOUNT_JSON_PATH;
const metadataRoot = path.resolve(process.cwd(), process.env.PLAY_METADATA_ROOT ?? path.join('Astroloji', 'play'));
const listingsRoot = path.join(metadataRoot, 'listings');
const releaseNotesRoot = path.join(metadataRoot, 'release-notes');
const changesNotSentForReview = process.env.PLAY_CHANGES_NOT_SENT_FOR_REVIEW?.toLowerCase() === 'true';
const releaseNotesTrack = process.env.PLAY_METADATA_TRACK?.trim();

if (!packageName) {
  throw new Error('PLAY_PACKAGE_NAME is required.');
}

if (!credentialsPath || !fs.existsSync(credentialsPath)) {
  throw new Error('PLAY_SERVICE_ACCOUNT_JSON_PATH must point to a readable service account JSON file.');
}

if (!fs.existsSync(listingsRoot)) {
  throw new Error(`Missing listings directory: ${listingsRoot}`);
}

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function loadServiceAccount() {
  return JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Google Play API request failed (${response.status} ${response.statusText}): ${text}`);
  }
  return body;
}

async function createAccessToken(serviceAccount) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: nowSeconds + 3600,
    iat: nowSeconds,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key).toString('base64url');
  const assertion = `${unsigned}.${signature}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const tokenText = await tokenResponse.text();
  if (!tokenResponse.ok) {
    throw new Error(`Access token request failed (${tokenResponse.status}): ${tokenText}`);
  }
  return JSON.parse(tokenText).access_token;
}

function readLocaleFiles(rootDir) {
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      locale: entry.name,
      path: path.join(rootDir, entry.name),
    }));
}

function readTrimmed(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').trim();
}

async function main() {
  const serviceAccount = loadServiceAccount();
  const accessToken = await createAccessToken(serviceAccount);
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json; charset=utf-8',
  };

  const edit = await fetchJson(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/edits`,
    {
      method: 'POST',
      headers,
      body: '{}',
    },
  );

  const editId = edit.id;
  const listings = readLocaleFiles(listingsRoot);
  if (listings.length === 0) {
    throw new Error(`No listings found under ${listingsRoot}`);
  }

  for (const listing of listings) {
    const payload = {
      language: listing.locale,
      title: readTrimmed(path.join(listing.path, 'title.txt')),
      shortDescription: readTrimmed(path.join(listing.path, 'short-description.txt')),
      fullDescription: readTrimmed(path.join(listing.path, 'full-description.txt')),
    };

    await fetchJson(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/edits/${editId}/listings/${encodeURIComponent(listing.locale)}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      },
    );
  }

  if (releaseNotesTrack && fs.existsSync(releaseNotesRoot)) {
    const releaseNotesLocales = readLocaleFiles(releaseNotesRoot)
      .map(({ locale, path: localePath }) => ({
        language: locale,
        text: readTrimmed(path.join(localePath, 'default.txt')),
      }));

    if (releaseNotesLocales.length > 0) {
      const track = await fetchJson(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/edits/${editId}/tracks/${encodeURIComponent(releaseNotesTrack)}`,
        {
          method: 'GET',
          headers,
        },
      );

      if (!track.releases?.length) {
        throw new Error(`Track '${releaseNotesTrack}' has no releases to attach release notes to.`);
      }

      const [primaryRelease, ...otherReleases] = track.releases;
      const updatedTrack = {
        ...track,
        releases: [
          {
            ...primaryRelease,
            releaseNotes: releaseNotesLocales,
          },
          ...otherReleases,
        ],
      };

      await fetchJson(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/edits/${editId}/tracks/${encodeURIComponent(releaseNotesTrack)}`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify(updatedTrack),
        },
      );
    }
  }

  const commitUrl = new URL(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/edits/${editId}:commit`,
  );
  if (changesNotSentForReview) {
    commitUrl.searchParams.set('changesNotSentForReview', 'true');
  }

  await fetchJson(commitUrl.toString(), {
    method: 'POST',
    headers,
    body: '{}',
  });

  console.log(`Published Play metadata edit ${editId} for ${listings.length} locale(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
