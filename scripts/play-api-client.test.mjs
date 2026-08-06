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
    if (pathname.endsWith('/listings/en-US/phoneScreenshots')) return response(200, { images: [{ id: 'image-1' }] });
    if (pathname.endsWith('/tracks/production')) return response(200, { track: 'production', releases: [] });
    if (pathname.endsWith('/subscriptions')) return response(200, { subscriptions: [{ productId: 'premium_monthly' }] });
    if (pathname.endsWith('/edits/edit-1:commit')) return response(200, { id: 'edit-1' });
    if (pathname.endsWith('/edits/edit-1') && init.method === 'DELETE') return response(200, null);
    throw new Error(`Unexpected request: ${init.method ?? 'GET'} ${url}`);
  };

  const client = createPlayClient({
    packageName: 'com.parsfilo.astrology',
    credentialsPath: credentialsFile(),
    fetchImpl,
  });

  assert.deepEqual(await client.createEdit(), { id: 'edit-1' });
  assert.deepEqual(await client.listListings('edit-1'), [{ language: 'en-US' }]);
  assert.equal((await client.getListing('edit-1', 'en-US')).title, 'Astrology');
  assert.deepEqual(await client.listImages('edit-1', 'en-US', 'phoneScreenshots'), [{ id: 'image-1' }]);
  assert.equal((await client.getTrack('edit-1', 'production')).track, 'production');
  assert.deepEqual(await client.listSubscriptions(), [{ productId: 'premium_monthly' }]);
  assert.deepEqual(await client.commitEdit('edit-1', { changesNotSentForReview: false }), { id: 'edit-1' });
  await client.deleteEdit('edit-1');

  const tokenCall = calls[0];
  assert.equal(tokenCall.url, 'https://oauth2.googleapis.com/token');
  assert.equal(tokenCall.method, 'POST');
  assert.match(String(tokenCall.body), /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/);
  const apiCalls = calls.slice(1);
  assert.ok(apiCalls.every((call) => !call.url.includes('unit-access-token')));
  assert.ok(apiCalls.every((call) => !String(call.body).includes('PRIVATE KEY')));
});

test('Play client error messages omit bearer tokens and private keys', async () => {
  const fetchImpl = async (url) => {
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      return response(200, { access_token: 'secret-token-that-must-not-leak' });
    }
    return response(403, { error: { message: 'forbidden' } });
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
      assert.doesNotMatch(error.message, /secret-token-that-must-not-leak|PRIVATE KEY/);
      return true;
    },
  );
});
