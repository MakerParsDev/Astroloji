import assert from 'node:assert/strict';
import test from 'node:test';

import { checkSsvTransitionRoute } from './check-ssv-transition-route.mjs';

const BASE_URL = 'https://astrology.parsfilo.com';

function successfulFetcher(url, init = {}) {
  const parsed = new URL(url);
  if (parsed.pathname === '/api/v1/health') {
    return Promise.resolve(Response.json({ status: 'ok', internal: 'not-evidence' }));
  }
  if (parsed.pathname === '/api/v1/rewards/ssv') {
    return Promise.resolve(
      Response.json(
        { error: { code: 'MALFORMED_CALLBACK', message: 'sensitive body' } },
        { status: 400 }
      )
    );
  }
  if (parsed.pathname === '/api/v1/rewards/claim') {
    const body = typeof init.body === 'string' ? init.body : '';
    if (body === '{') {
      return Promise.resolve(
        Response.json({ error: { code: 'INVALID_REQUEST', message: 'raw parse detail' } }, { status: 400 })
      );
    }
    return Promise.resolve(
      Response.json({ error: { code: 'INVALID_TOKEN', message: 'origin detail' } }, { status: 401 })
    );
  }
  if (parsed.pathname === '/api/v1/rewards/unsupported') {
    return Promise.resolve(
      Response.json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'local detail' } }, { status: 405 })
    );
  }
  return Promise.resolve(Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 }));
}

test('requires origin health and transition route isolation', async () => {
  const evidence = await checkSsvTransitionRoute({
    baseUrl: BASE_URL,
    fetcher: successfulFetcher,
    legacyJwt: 'invalid-smoke-token'
  });

  assert.deepEqual(evidence, {
    originHealth: 200,
    malformedSsv: 400,
    malformedSsvCode: 'MALFORMED_CALLBACK',
    legacyOriginResponse: 401,
    legacyOriginCode: 'INVALID_TOKEN',
    unsupportedReward: 405,
    unsupportedRewardCode: 'METHOD_NOT_ALLOWED',
    invalidJson: 400,
    invalidJsonCode: 'INVALID_REQUEST'
  });
});

test('does not expose raw bodies or the bearer token in evidence', async () => {
  const evidence = await checkSsvTransitionRoute({
    baseUrl: BASE_URL,
    fetcher: successfulFetcher,
    legacyJwt: 'super-secret-smoke-token'
  });
  const serialized = JSON.stringify(evidence);

  assert.doesNotMatch(serialized, /sensitive body|origin detail|raw parse detail|local detail/);
  assert.doesNotMatch(serialized, /super-secret-smoke-token/);
});

test('rejects a permissive or missing transition route', async () => {
  const fetcher = async (url) => {
    const path = new URL(url).pathname;
    if (path === '/api/v1/health') return Response.json({ status: 'ok' });
    return Response.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });
  };

  await assert.rejects(
    checkSsvTransitionRoute({
      baseUrl: BASE_URL,
      fetcher,
      legacyJwt: 'invalid-smoke-token'
    }),
    /Malformed SSV route check failed/
  );
});

test('aborts a stalled request with a bounded timeout', async () => {
  let observedSignal;
  const fetcher = (_url, init = {}) => {
    observedSignal = init.signal;
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
  };

  await assert.rejects(
    checkSsvTransitionRoute({
      baseUrl: BASE_URL,
      fetcher,
      legacyJwt: 'invalid-smoke-token',
      timeoutMs: 10
    }),
    /timed out/
  );
  assert.equal(observedSignal?.aborted, true);
});

test('requires base URL and smoke JWT', async () => {
  await assert.rejects(
    checkSsvTransitionRoute({ baseUrl: '', fetcher: successfulFetcher, legacyJwt: 'token' }),
    /BACKEND_BASE_URL is required/
  );
  await assert.rejects(
    checkSsvTransitionRoute({ baseUrl: BASE_URL, fetcher: successfulFetcher, legacyJwt: '' }),
    /LEGACY_SMOKE_JWT is required/
  );
});
