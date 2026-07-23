import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const MAX_PLAY_VERSION_CODE = 2_100_000_000;


function sanitizeDiagnostic(value) {
  return String(value ?? '')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

export function formatGoogleOAuthError(status, body = {}) {
  const error = sanitizeDiagnostic(body?.error || 'unknown_error');
  const description = sanitizeDiagnostic(body?.error_description || '');
  const suffix = description ? `: ${error} - ${description}` : `: ${error}`;
  const punctuation = /[.!?]$/.test(suffix) ? '' : '.';
  return `Google OAuth token request failed (${status})${suffix}${punctuation}`;
}


export function parseJsonObject(text) {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    return {};
  }
  return {};
}

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

export function collectVersionCodes({ tracks = [], bundles = [], apks = [] } = {}) {
  const values = [];
  for (const track of tracks) {
    for (const release of track.releases ?? []) {
      values.push(...(release.versionCodes ?? []));
    }
  }
  values.push(...bundles.map((bundle) => bundle.versionCode));
  values.push(...apks.map((apk) => apk.versionCode));

  return [...new Set(values
    .map((value) => Number(value))
    .filter((value) => Number.isSafeInteger(value) && value > 0))]
    .sort((a, b) => a - b);
}

export function summarizeVersionCodes(sources) {
  const versionCodes = collectVersionCodes(sources);
  const maxVersionCode = versionCodes.at(-1) ?? 0;
  const recommendedVersionCode = maxVersionCode + 1;
  if (recommendedVersionCode > MAX_PLAY_VERSION_CODE) {
    throw new Error('No valid Google Play version code remains.');
  }
  return { maxVersionCode, recommendedVersionCode, versionCodes };
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Google Play API request failed (${response.status} ${response.statusText}).`);
  }
  return text ? JSON.parse(text) : {};
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
  const assertion = `${unsigned}.${signer.sign(serviceAccount.private_key).toString('base64url')}`;
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const tokenText = await tokenResponse.text();
  const body = parseJsonObject(tokenText);
  if (!tokenResponse.ok) {
    throw new Error(formatGoogleOAuthError(tokenResponse.status, body));
  }
  if (!body.access_token) throw new Error('Google OAuth response did not contain an access token.');
  return body.access_token;
}

export async function checkPlayReleaseAccess({ packageName, credentialsPath }) {
  if (!packageName) throw new Error('PLAY_PACKAGE_NAME is required.');
  if (!credentialsPath || !fs.existsSync(credentialsPath)) {
    throw new Error('PLAY_SERVICE_ACCOUNT_JSON_PATH must point to a readable file.');
  }

  const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const accessToken = await createAccessToken(serviceAccount);
  const baseUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json; charset=utf-8',
  };
  let editId = '';
  let primaryError;

  try {
    const edit = await fetchJson(`${baseUrl}/edits`, { method: 'POST', headers, body: '{}' });
    editId = edit.id;
    if (!editId) throw new Error('Google Play did not return an edit ID.');
    const editUrl = `${baseUrl}/edits/${encodeURIComponent(editId)}`;
    const [trackBody, bundleBody, apkBody] = await Promise.all([
      fetchJson(`${editUrl}/tracks`, { headers }),
      fetchJson(`${editUrl}/bundles`, { headers }),
      fetchJson(`${editUrl}/apks`, { headers }),
    ]);
    return {
      ...summarizeVersionCodes({
        tracks: trackBody.tracks ?? [],
        bundles: bundleBody.bundles ?? [],
        apks: apkBody.apks ?? [],
      }),
      trackCount: (trackBody.tracks ?? []).length,
    };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (editId) {
      const response = await fetch(`${baseUrl}/edits/${encodeURIComponent(editId)}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok && !primaryError) {
        throw new Error(`Google Play temporary edit cleanup failed (${response.status}).`);
      }
    }
  }
}

async function main() {
  const result = await checkPlayReleaseAccess({
    packageName: process.env.PLAY_PACKAGE_NAME,
    credentialsPath: process.env.PLAY_SERVICE_ACCOUNT_JSON_PATH,
  });
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `max_version_code=${result.maxVersionCode}\nrecommended_version_code=${result.recommendedVersionCode}\n`,
    );
  }
  console.log(JSON.stringify({
    packageAccess: true,
    trackCount: result.trackCount,
    maxVersionCode: result.maxVersionCode,
    recommendedVersionCode: result.recommendedVersionCode,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
