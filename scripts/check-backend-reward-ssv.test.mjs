import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBackendRewardSsv } from './check-backend-reward-ssv.mjs';

function response(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

test('accepts a fail-closed malformed SSV callback response', async () => {
  let requestedUrl = '';
  const result = await checkBackendRewardSsv({
    baseUrl: 'https://astrology.parsfilo.com/',
    fetcher: async (url) => {
      requestedUrl = url;
      return response(400, { error: { code: 'MALFORMED_CALLBACK' } });
    },
  });

  assert.equal(requestedUrl, 'https://astrology.parsfilo.com/api/v1/rewards/ssv?preflight=invalid');
  assert.equal(result.status, 400);
  assert.equal(result.errorCode, 'MALFORMED_CALLBACK');
});

test('rejects an absent or permissive backend SSV route', async () => {
  await assert.rejects(
    checkBackendRewardSsv({
      baseUrl: 'https://astrology.parsfilo.com',
      fetcher: async () => response(404, { error: { code: 'NOT_FOUND' } }),
    }),
    /preflight failed/,
  );
  await assert.rejects(
    checkBackendRewardSsv({
      baseUrl: 'https://astrology.parsfilo.com',
      fetcher: async () => response(200, { ok: true }),
    }),
    /preflight failed/,
  );
});

test('aborts a stalled backend preflight request', async () => {
  await assert.rejects(
    checkBackendRewardSsv({
      baseUrl: 'https://astrology.parsfilo.com',
      timeoutMs: 5,
      fetcher: async (_url, init) =>
        await new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
    }),
    /timed out/,
  );
});

test('requires the backend base URL and valid JSON', async () => {
  await assert.rejects(checkBackendRewardSsv({ baseUrl: '' }), /BACKEND_BASE_URL/);
  await assert.rejects(
    checkBackendRewardSsv({
      baseUrl: 'https://astrology.parsfilo.com',
      fetcher: async () => ({ status: 400, async text() { return '<html>'; } }),
    }),
    /invalid JSON/,
  );
});
