import crypto from 'node:crypto';
import fs from 'node:fs';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_ROOT = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function readCredentials(credentialsPath) {
  if (!credentialsPath || !fs.existsSync(credentialsPath)) {
    throw new Error('PLAY_SERVICE_ACCOUNT_JSON_PATH must point to a readable service-account JSON file.');
  }
  const parsed = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Play service-account JSON is missing client_email or private_key.');
  }
  return parsed;
}

function createAssertion(credentials, nowSeconds) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: TOKEN_URL,
    exp: nowSeconds + 3600,
    iat: nowSeconds,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(credentials.private_key).toString('base64url')}`;
}

async function parseJsonResponse(response, context) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${context} failed (${response.status} ${response.statusText}).`);
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${context} returned invalid JSON.`);
  }
}

export function createPlayClient({ packageName, credentialsPath, fetchImpl = fetch, now = Date.now }) {
  if (!packageName) throw new Error('PLAY_PACKAGE_NAME is required.');
  const credentials = readCredentials(credentialsPath);
  let cachedToken;
  let tokenExpiresAt = 0;

  async function accessToken() {
    const currentMillis = now();
    if (cachedToken && currentMillis < tokenExpiresAt - 60_000) return cachedToken;

    const assertion = createAssertion(credentials, Math.floor(currentMillis / 1000));
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    const body = await parseJsonResponse(response, 'Google OAuth token exchange');
    if (!body.access_token) throw new Error('Google OAuth token exchange returned no access token.');
    cachedToken = body.access_token;
    tokenExpiresAt = currentMillis + Number(body.expires_in ?? 3600) * 1000;
    return cachedToken;
  }

  async function request(relativePath, { method = 'GET', body, headers = {} } = {}) {
    const token = await accessToken();
    const response = await fetchImpl(`${API_ROOT}/${encodeURIComponent(packageName)}${relativePath}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
    return parseJsonResponse(response, `Google Play API ${method} ${relativePath}`);
  }

  return {
    packageName,
    request,
    createEdit: () => request('/edits', { method: 'POST', body: {} }),
    async listListings(editId) {
      const body = await request(`/edits/${encodeURIComponent(editId)}/listings`);
      return body.listings ?? [];
    },
    getListing: (editId, locale) =>
      request(`/edits/${encodeURIComponent(editId)}/listings/${encodeURIComponent(locale)}`),
    updateListing: (editId, locale, listing) =>
      request(`/edits/${encodeURIComponent(editId)}/listings/${encodeURIComponent(locale)}`, {
        method: 'PUT',
        body: listing,
      }),
    deleteListing: (editId, locale) =>
      request(`/edits/${encodeURIComponent(editId)}/listings/${encodeURIComponent(locale)}`, {
        method: 'DELETE',
      }),
    async listImages(editId, locale, imageType) {
      const body = await request(
        `/edits/${encodeURIComponent(editId)}/listings/${encodeURIComponent(locale)}/${encodeURIComponent(imageType)}`,
      );
      return body.images ?? [];
    },
    getTrack: (editId, track) =>
      request(`/edits/${encodeURIComponent(editId)}/tracks/${encodeURIComponent(track)}`),
    updateTrack: (editId, track, value) =>
      request(`/edits/${encodeURIComponent(editId)}/tracks/${encodeURIComponent(track)}`, {
        method: 'PUT',
        body: value,
      }),
    async listSubscriptions() {
      const body = await request('/subscriptions');
      return body.subscriptions ?? [];
    },
    commitEdit(editId, { changesNotSentForReview = false } = {}) {
      const query = changesNotSentForReview ? '?changesNotSentForReview=true' : '';
      return request(`/edits/${encodeURIComponent(editId)}:commit${query}`, {
        method: 'POST',
        body: {},
      });
    },
    deleteEdit: (editId) => request(`/edits/${encodeURIComponent(editId)}`, { method: 'DELETE' }),
  };
}
