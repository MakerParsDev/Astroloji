import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { SignJWT } from 'jose';

import { RATE_LIMIT_POLICIES } from '../src/services/rateLimit';

const PRODUCTION_BASE_URL = 'https://astrology.parsfilo.com';
const MIN_BURST_WINDOW_MS = 8_000;
const BOUNDARY_SETTLE_MS = 300;
const PRODUCTION_REQUEST_TIMEOUT_MS = 10_000;

export interface LiveRateLimitResponse {
  status: number;
  retryAfter: string | null;
  bodyText: string;
}

export interface LiveRateLimitClassification {
  strictRateLimitMatched: boolean;
  admittedRequestsHitValidation: boolean;
  rejectedRequestsWereRateLimited: boolean;
  retryAfterPresent: boolean;
}

function backendErrorCode(bodyText: string): string | null {
  try {
    const value = JSON.parse(bodyText) as { error?: { code?: unknown } };
    return typeof value.error?.code === 'string' ? value.error.code : null;
  } catch {
    return null;
  }
}

export function classifyLiveRateLimitResponses(
  responses: LiveRateLimitResponse[]
): LiveRateLimitClassification {
  let validationCount = 0;
  let limitedCount = 0;
  let invalidResponse = false;
  let retryAfterPresent = true;

  for (const response of responses) {
    const code = backendErrorCode(response.bodyText);
    if (response.status === 400 && code === 'INVALID_REQUEST') {
      validationCount += 1;
      continue;
    }
    if (response.status === 429 && code === 'RATE_LIMITED') {
      limitedCount += 1;
      if (!response.retryAfter) retryAfterPresent = false;
      continue;
    }
    invalidResponse = true;
  }

  const admittedRequestsHitValidation =
    !invalidResponse && validationCount === RATE_LIMIT_POLICIES.chart.limit;
  const rejectedRequestsWereRateLimited =
    !invalidResponse && limitedCount > 0 && validationCount + limitedCount === responses.length;
  const strictRateLimitMatched =
    admittedRequestsHitValidation && rejectedRequestsWereRateLimited && retryAfterPresent;

  return {
    strictRateLimitMatched,
    admittedRequestsHitValidation,
    rejectedRequestsWereRateLimited,
    retryAfterPresent
  };
}

function requiredEnv(name: 'BACKEND_BASE_URL' | 'VERIFY_USER_ID' | 'VERIFY_FIREBASE_UID' | 'JWT_SECRET'): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required verification setting: ${name}`);
  return value;
}

async function createEphemeralJwt(userId: string, firebaseUid: string, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  return new SignJWT({
    user_id: userId,
    firebase_uid: firebaseUid,
    is_premium: false
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setJti(crypto.randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + 5 * 60)
    .sign(new TextEncoder().encode(secret));
}

export async function fetchProductionHealthDate(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = PRODUCTION_REQUEST_TIMEOUT_MS
): Promise<string | null> {
  const response = await fetchImpl(`${baseUrl}/api/v1/health`, {
    method: 'GET',
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error('Production health preflight failed.');
  return response.headers.get('date');
}

export async function fetchChartProbe(
  baseUrl: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = PRODUCTION_REQUEST_TIMEOUT_MS
): Promise<LiveRateLimitResponse> {
  const response = await fetchImpl(`${baseUrl}/api/v1/chart/natal`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: '{}'
  });
  return {
    status: response.status,
    retryAfter: response.headers.get('retry-after'),
    bodyText: await response.text()
  };
}

async function alignWithFixedWindow(baseUrl: string): Promise<void> {
  const dateHeader = await fetchProductionHealthDate(baseUrl);
  const serverNow = dateHeader ? Date.parse(dateHeader) : Number.NaN;
  if (!Number.isFinite(serverNow)) throw new Error('Production health response is missing a valid Date header.');

  const windowMs = RATE_LIMIT_POLICIES.chart.windowSeconds * 1_000;
  const remainingMs = windowMs - (serverNow % windowMs);
  if (remainingMs < MIN_BURST_WINDOW_MS) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs + BOUNDARY_SETTLE_MS));
  }
}

async function runProductionVerification(): Promise<void> {
  const baseUrl = requiredEnv('BACKEND_BASE_URL');
  if (baseUrl !== PRODUCTION_BASE_URL) throw new Error('Unexpected backend verification target.');
  const userId = requiredEnv('VERIFY_USER_ID');
  const firebaseUid = requiredEnv('VERIFY_FIREBASE_UID');
  const jwtSecret = requiredEnv('JWT_SECRET');

  await alignWithFixedWindow(baseUrl);
  const token = await createEphemeralJwt(userId, firebaseUid, jwtSecret);
  const burstSize = RATE_LIMIT_POLICIES.chart.limit + Math.max(5, Math.ceil(RATE_LIMIT_POLICIES.chart.limit / 4));
  const responses = await Promise.all(
    Array.from({ length: burstSize }, () => fetchChartProbe(baseUrl, token))
  );

  const classification = classifyLiveRateLimitResponses(responses);
  const output = { ...classification, syntheticPrincipalIsolated: true };
  for (const [name, value] of Object.entries(output)) {
    console.log(`${name}=${value}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
  if (!classification.strictRateLimitMatched) throw new Error('Strict rate-limit verification did not match the required response pattern.');
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  runProductionVerification().catch(() => {
    console.error('Rate limit production verification failed.');
    process.exitCode = 1;
  });
}
