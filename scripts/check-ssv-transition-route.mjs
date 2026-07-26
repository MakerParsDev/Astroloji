import { pathToFileURL } from 'node:url';

function requireValue(value, name) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function fetchWithTimeout(fetcher, url, init, timeoutMs, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${label} timed out.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readErrorCode(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    const body = JSON.parse(text);
    return typeof body?.error?.code === 'string' ? body.error.code : null;
  } catch {
    return null;
  }
}

function expectResult(label, actualStatus, expectedStatus, actualCode, expectedCode) {
  if (actualStatus !== expectedStatus || (expectedCode && actualCode !== expectedCode)) {
    throw new Error(
      `${label} failed (${actualStatus}, ${actualCode ?? 'unknown'}); expected (${expectedStatus}, ${expectedCode ?? 'any'}).`
    );
  }
}

export async function checkSsvTransitionRoute({
  baseUrl,
  fetcher = fetch,
  timeoutMs = 10_000,
  legacyJwt
}) {
  requireValue(baseUrl, 'BACKEND_BASE_URL');
  requireValue(legacyJwt, 'LEGACY_SMOKE_JWT');
  const root = baseUrl.replace(/\/$/, '');
  const today = new Date().toISOString().slice(0, 10);

  const health = await fetchWithTimeout(
    fetcher,
    `${root}/api/v1/health`,
    { headers: { accept: 'application/json' } },
    timeoutMs,
    'Origin health check'
  );
  expectResult('Origin health check', health.status, 200, null, null);

  const malformedSsv = await fetchWithTimeout(
    fetcher,
    `${root}/api/v1/rewards/ssv?preflight=invalid`,
    { headers: { accept: 'application/json' } },
    timeoutMs,
    'Malformed SSV route check'
  );
  const malformedSsvCode = await readErrorCode(malformedSsv);
  expectResult(
    'Malformed SSV route check',
    malformedSsv.status,
    400,
    malformedSsvCode,
    'MALFORMED_CALLBACK'
  );

  const legacy = await fetchWithTimeout(
    fetcher,
    `${root}/api/v1/rewards/claim`,
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${legacyJwt}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ reward_type: 'daily', identifier: today })
    },
    timeoutMs,
    'Legacy origin forwarding check'
  );
  const legacyOriginCode = await readErrorCode(legacy);
  if (legacy.status !== 401) {
    throw new Error(
      `Legacy origin forwarding check failed (${legacy.status}, ${legacyOriginCode ?? 'unknown'}); expected origin authentication response 401.`
    );
  }

  const unsupported = await fetchWithTimeout(
    fetcher,
    `${root}/api/v1/rewards/unsupported`,
    {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: '{}'
    },
    timeoutMs,
    'Unsupported reward route check'
  );
  const unsupportedRewardCode = await readErrorCode(unsupported);
  expectResult(
    'Unsupported reward route check',
    unsupported.status,
    405,
    unsupportedRewardCode,
    'METHOD_NOT_ALLOWED'
  );

  const invalidJson = await fetchWithTimeout(
    fetcher,
    `${root}/api/v1/rewards/claim`,
    {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: '{'
    },
    timeoutMs,
    'Invalid JSON route check'
  );
  const invalidJsonCode = await readErrorCode(invalidJson);
  expectResult(
    'Invalid JSON route check',
    invalidJson.status,
    400,
    invalidJsonCode,
    'INVALID_REQUEST'
  );

  return {
    originHealth: health.status,
    malformedSsv: malformedSsv.status,
    malformedSsvCode,
    legacyOriginResponse: legacy.status,
    legacyOriginCode,
    unsupportedReward: unsupported.status,
    unsupportedRewardCode,
    invalidJson: invalidJson.status,
    invalidJsonCode
  };
}

async function main() {
  const evidence = await checkSsvTransitionRoute({
    baseUrl: process.env.BACKEND_BASE_URL,
    legacyJwt: process.env.LEGACY_SMOKE_JWT ?? 'invalid-transition-smoke-token'
  });
  console.log(JSON.stringify({ transitionRouteReady: true, ...evidence }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
