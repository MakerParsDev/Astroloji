import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPlayClient } from './lib/play-api-client.mjs';

function credentialsFile() {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'play-client-'));
  const filePath = path.join(dir, 'service-account.json');
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      client_email: 'service-account@example.invalid',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }),
    { mode: 0o600 },
  );
  return filePath;
}

function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'ERROR',
    async text() {
      return body === null ? '' : JSON.stringify(body);
    },
  };
}

test('Play client exchanges JWT and exposes bounded Android Publisher methods', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body ?? '' });
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      return response(200, { access_token: 'unit-access-token' });
    }
    const pathname = new URL(String(url)).pathname;
    if (pathname.endsWith('/edits') && (init.method ?? 'GET') === 'POST') return response(200, { id: 'edit-1' });
    if (pathname.endsWith('/listings')) return response(200, { listings: [{ language: 'en-US' }] });
    if (pathname.endsWith('/listings/en-US')) return response(200, { language: 'en-US', title: 'Astrology' });
    if (String(url).startsWith('https://androidpublisher.googleapis.com/upload/')) {
      assert.equal(init.method, 'POST');
      assert.equal(init.headers['Content-Type'], 'image/png');
      assert.ok(Buffer.isBuffer(init.body));
      return response(200, { image: { id: 'uploaded-image', sha256: 'uploaded-sha' } });
    }
    if (pathname.endsWith('/listings/en-US/phoneScreenshots') && init.method === 'DELETE') {
      return response(200, { deleted: [{ id: 'old-image' }] });
    }
    if (pathname.endsWith('/listings/en-US/phoneScreenshots')) return response(200, { images: [{ id: 'image-1' }] });
    if (pathname.endsWith('/tracks/production')) return response(200, { track: 'production', releases: [] });
    if (pathname.endsWith('/subscriptions')) return response(200, { subscriptions: [{ productId: 'premium_monthly' }] });
    if (pathname.endsWith('/edits/edit-1:commit')) return response(200, { id: 'edit-1' });
    if (pathname.endsWith('/edits/edit-1') && init.method === 'DELETE') return response(200, null);
    throw new Error(`Unexpected request: ${init.method ?? 'GET'} ${url}`);
  };

  const credentials = credentialsFile();
  const client = createPlayClient({
    packageName: 'com.parsfilo.astrology',
    credentialsPath: credentials,
    fetchImpl,
  });

  assert.deepEqual(await client.createEdit(), { id: 'edit-1' });
  assert.deepEqual(await client.listListings('edit-1'), [{ language: 'en-US' }]);
  assert.equal((await client.getListing('edit-1', 'en-US')).title, 'Astrology');
  assert.deepEqual(await client.listImages('edit-1', 'en-US', 'phoneScreenshots'), [{ id: 'image-1' }]);
  assert.deepEqual(await client.deleteAllImages('edit-1', 'en-US', 'phoneScreenshots'), {
    deleted: [{ id: 'old-image' }],
  });
  const imagePath = path.join(path.dirname(credentials), 'upload.png');
  fs.writeFileSync(imagePath, Buffer.from('png-bytes'));
  assert.deepEqual(await client.uploadImage('edit-1', 'en-US', 'phoneScreenshots', imagePath), {
    id: 'uploaded-image',
    sha256: 'uploaded-sha',
  });
  assert.equal((await client.getTrack('edit-1', 'production')).track, 'production');
  assert.deepEqual(await client.listSubscriptions(), [{ productId: 'premium_monthly' }]);
  assert.deepEqual(
    await client.commitEdit('edit-1', {
      changesNotSentForReview: false,
      changesInReviewBehavior: 'ERROR_IF_IN_REVIEW',
    }),
    { id: 'edit-1' },
  );
  await client.deleteEdit('edit-1');

  const tokenCall = calls[0];
  assert.equal(tokenCall.url, 'https://oauth2.googleapis.com/token');
  assert.equal(tokenCall.method, 'POST');
  assert.match(String(tokenCall.body), /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/);
  const apiCalls = calls.slice(1);
  const commitCall = apiCalls.find((call) => call.url.includes(':commit'));
  assert.match(commitCall.url, /changesInReviewBehavior=ERROR_IF_IN_REVIEW/);
  assert.ok(apiCalls.every((call) => !call.url.includes('unit-access-token')));
  assert.ok(apiCalls.every((call) => !String(call.body).includes('PRIVATE KEY')));
});

test('Play client error messages omit bearer tokens and private keys', async () => {
  const fetchImpl = async (url) => {
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      return response(200, { access_token: 'secret-token-that-must-not-leak' });
    }
    return response(403, { error: { status: 'PERMISSION_DENIED', message: 'forbidden operator@example.invalid' } });
  };
  const client = createPlayClient({
    packageName: 'com.parsfilo.astrology',
    credentialsPath: credentialsFile(),
    fetchImpl,
  });
  await assert.rejects(
    client.createEdit(),
    (error) => {
      assert.match(error.message, /403/);
      assert.match(error.message, /PERMISSION_DENIED/);
      assert.doesNotMatch(error.message, /forbidden operator@example\.invalid|secret-token-that-must-not-leak|PRIVATE KEY/);
      return true;
    },
  );
});

test('image upload uses Google media upload semantics', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET' });
    if (String(url) === 'https://oauth2.googleapis.com/token') return response(200, { access_token: 'token' });
    if (String(url).startsWith('https://androidpublisher.googleapis.com/upload/')) {
      return response(200, { image: { id: 'img', sha256: 'a'.repeat(64) } });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  const client = createPlayClient({ packageName: 'com.parsfilo.astrology', credentialsPath: credentialsFile(), fetchImpl });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'play-upload-'));
  const image = path.join(dir, 'asset.png');
  fs.writeFileSync(image, Buffer.from('image'));
  await client.uploadImage('edit', 'tr-TR', 'featureGraphic', image);
  const upload = calls.find((call) => call.url.includes('/upload/'));
  assert.match(upload.url, /[?&]uploadType=media(?:&|$)/);
});

test('missing track is normalized to an empty track instead of aborting backup', async () => {
  const fetchImpl = async (url) => {
    if (String(url) === 'https://oauth2.googleapis.com/token') return response(200, { access_token: 'token' });
    if (String(url).includes('/tracks/production')) return response(404, { error: { message: 'not found' } });
    throw new Error(`Unexpected request ${url}`);
  };
  const client = createPlayClient({ packageName: 'com.parsfilo.astrology', credentialsPath: credentialsFile(), fetchImpl });
  assert.deepEqual(await client.getTrack('edit', 'production'), { track: 'production', releases: [] });
});

test('subscription listing follows nextPageToken pagination', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url) === 'https://oauth2.googleapis.com/token') return response(200, { access_token: 'token' });
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith('/subscriptions') && !parsed.searchParams.get('pageToken')) {
      return response(200, { subscriptions: [{ productId: 'premium_monthly' }], nextPageToken: 'page-2' });
    }
    if (parsed.pathname.endsWith('/subscriptions') && parsed.searchParams.get('pageToken') === 'page-2') {
      return response(200, { subscriptions: [{ productId: 'premium_weekly' }] });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  const client = createPlayClient({ packageName: 'com.parsfilo.astrology', credentialsPath: credentialsFile(), fetchImpl });
  assert.deepEqual(await client.listSubscriptions(), [
    { productId: 'premium_monthly' },
    { productId: 'premium_weekly' },
  ]);
  assert.ok(calls.some((url) => url.includes('pageToken=page-2')));
});


test('subscription pagination rejects a repeated nextPageToken', async () => {
  const fetchImpl = async (url) => {
    if (String(url) === 'https://oauth2.googleapis.com/token') return response(200, { access_token: 'token' });
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith('/subscriptions')) {
      return response(200, { subscriptions: [{ productId: 'premium_monthly' }], nextPageToken: 'loop' });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  const client = createPlayClient({ packageName: 'com.parsfilo.astrology', credentialsPath: credentialsFile(), fetchImpl });
  await assert.rejects(client.listSubscriptions(), /repeated.*page token/i);
});

test('Play client caches access tokens until the refresh window', async () => {
  let currentMillis = 1_000_000;
  let tokenExchanges = 0;
  const fetchImpl = async (url, init = {}) => {
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      tokenExchanges += 1;
      return response(200, { access_token: `token-${tokenExchanges}`, expires_in: 120 });
    }
    const pathname = new URL(String(url)).pathname;
    if (pathname.endsWith('/edits') && (init.method ?? 'GET') === 'POST') return response(200, { id: 'edit' });
    throw new Error(`Unexpected request ${url}`);
  };
  const client = createPlayClient({
    packageName: 'com.parsfilo.astrology',
    credentialsPath: credentialsFile(),
    fetchImpl,
    now: () => currentMillis,
  });
  await client.createEdit();
  currentMillis += 30_000;
  await client.createEdit();
  assert.equal(tokenExchanges, 1);
  currentMillis += 31_000;
  await client.createEdit();
  assert.equal(tokenExchanges, 2);
});

test('idempotent Play DELETE retries transient 503 responses with bounded exponential backoff', async () => {
  let deleteAttempts = 0;
  const delays = [];
  const fetchImpl = async (url, init = {}) => {
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      return response(200, { access_token: 'token' });
    }
    const pathname = new URL(String(url)).pathname;
    if (pathname.endsWith('/edits/edit/listings/fa-IR') && init.method === 'DELETE') {
      deleteAttempts += 1;
      if (deleteAttempts < 3) return response(503, { error: { status: 'UNAVAILABLE' } });
      return response(200, {});
    }
    throw new Error(`Unexpected request ${init.method ?? 'GET'} ${url}`);
  };
  const client = createPlayClient({
    packageName: 'com.parsfilo.astrology',
    credentialsPath: credentialsFile(),
    fetchImpl,
    maxTransientRetries: 3,
    retryBaseDelayMs: 10,
    sleep: async (ms) => delays.push(ms),
  });

  assert.deepEqual(await client.deleteListing('edit', 'fa-IR'), {});
  assert.equal(deleteAttempts, 3);
  assert.deepEqual(delays, [10, 20]);
});

test('ambiguous DELETE success is accepted when a transient retry is followed by 404', async () => {
  let deleteAttempts = 0;
  const fetchImpl = async (url, init = {}) => {
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      return response(200, { access_token: 'token' });
    }
    const pathname = new URL(String(url)).pathname;
    if (pathname.endsWith('/edits/edit/listings/fa-IR') && init.method === 'DELETE') {
      deleteAttempts += 1;
      if (deleteAttempts === 1) return response(503, { error: { status: 'UNAVAILABLE' } });
      return response(404, { error: { status: 'NOT_FOUND' } });
    }
    throw new Error(`Unexpected request ${init.method ?? 'GET'} ${url}`);
  };
  const client = createPlayClient({
    packageName: 'com.parsfilo.astrology',
    credentialsPath: credentialsFile(),
    fetchImpl,
    retryBaseDelayMs: 1,
    sleep: async () => {},
  });

  assert.deepEqual(await client.deleteListing('edit', 'fa-IR'), {});
  assert.equal(deleteAttempts, 2);
});

test('non-idempotent Play POST requests are never retried on transient 503 responses', async () => {
  let createAttempts = 0;
  const delays = [];
  const fetchImpl = async (url, init = {}) => {
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      return response(200, { access_token: 'token' });
    }
    const pathname = new URL(String(url)).pathname;
    if (pathname.endsWith('/edits') && init.method === 'POST') {
      createAttempts += 1;
      return response(503, { error: { status: 'UNAVAILABLE' } });
    }
    throw new Error(`Unexpected request ${init.method ?? 'GET'} ${url}`);
  };
  const client = createPlayClient({
    packageName: 'com.parsfilo.astrology',
    credentialsPath: credentialsFile(),
    fetchImpl,
    maxTransientRetries: 3,
    retryBaseDelayMs: 1,
    sleep: async (ms) => delays.push(ms),
  });

  await assert.rejects(client.createEdit(), /503.*UNAVAILABLE/i);
  assert.equal(createAttempts, 1);
  assert.deepEqual(delays, []);
});
