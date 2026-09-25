import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

import { createPlayClient } from './lib/play-api-client.mjs';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REPORTING_ROOT = 'https://playdeveloperreporting.googleapis.com/v1beta1';
const REPORTING_SCOPE = 'https://www.googleapis.com/auth/playdeveloperreporting';
const CRASH_THRESHOLD = 0.0109;
const ANR_THRESHOLD = 0.0047;
const MINIMUM_VITALS_USERS = 100;

export function evaluateVitals({
  crashRate,
  anrRate,
  distinctUsers,
  minimumUsers = MINIMUM_VITALS_USERS,
  reportingAvailable = true,
}) {
  if (!reportingAvailable) {
    return {
      state: 'unavailable',
      reason: 'Play Developer Reporting is unavailable; autonomous promotion is frozen.',
    };
  }
  if (
    !Number.isFinite(crashRate) ||
    !Number.isFinite(anrRate) ||
    !Number.isFinite(distinctUsers) ||
    distinctUsers < minimumUsers
  ) {
    return {
      state: 'insufficient',
      reason: 'Play vitals are unavailable or below the minimum user sample.',
    };
  }
  if (crashRate >= CRASH_THRESHOLD || anrRate >= ANR_THRESHOLD) {
    return {
      state: 'unhealthy',
      reason: `Play vitals exceed threshold (crash=${crashRate}, anr=${anrRate}, users=${distinctUsers}).`,
    };
  }
  return {
    state: 'healthy',
    reason: `Play vitals are below threshold (crash=${crashRate}, anr=${anrRate}, users=${distinctUsers}).`,
  };
}

export function decideRolloutAction({
  status,
  fraction,
  ageHours,
  vitalsState,
  healthOk = true,
}) {
  const current = Number.isFinite(Number(fraction)) ? Number(fraction) : 0;
  if (status === 'halted' || status === 'completed') {
    return { action: 'hold', targetFraction: status === 'completed' ? 1 : current };
  }
  if (status !== 'inProgress') return { action: 'hold', targetFraction: current };
  if (!healthOk || vitalsState === 'unhealthy') {
    return { action: 'halt', targetFraction: current };
  }
  if (vitalsState === 'unavailable') {
    return { action: 'hold', targetFraction: current };
  }

  const healthy = vitalsState === 'healthy';
  if (current <= 0.1) {
    if (ageHours < (healthy ? 24 : 72)) return { action: 'hold', targetFraction: current };
    return { action: 'promote', targetFraction: 0.25 };
  }
  if (current <= 0.25) {
    if (ageHours < (healthy ? 48 : 96)) return { action: 'hold', targetFraction: current };
    return { action: 'promote', targetFraction: 0.5 };
  }
  if (current <= 0.5) {
    if (ageHours < (healthy ? 96 : 168)) return { action: 'hold', targetFraction: current };
    return { action: 'complete', targetFraction: 1 };
  }
  return { action: 'complete', targetFraction: 1 };
}

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function createAssertion(credentials, scope, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: credentials.client_email,
    scope,
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

async function reportingToken(credentialsPath, fetchImpl = fetch) {
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Play service account is missing client_email or private_key.');
  }
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: createAssertion(credentials, REPORTING_SCOPE),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Play Developer Reporting OAuth failed (${response.status}).`);
  const body = await response.json();
  if (!body.access_token) throw new Error('Play Developer Reporting OAuth returned no access token.');
  return body.access_token;
}

function normalizeCivilDateTime(value, context) {
  const year = Number(value?.year);
  const month = Number(value?.month);
  const day = Number(value?.day);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`${context} is missing a valid civil date.`);
  }
  return {
    year,
    month,
    day,
    ...(typeof value?.timeZone === 'string' && value.timeZone ? { timeZone: value.timeZone } : {}),
  };
}

function subtractCivilDays(value, days) {
  const normalized = normalizeCivilDateTime(value, 'Play vitals freshness');
  const date = new Date(Date.UTC(normalized.year, normalized.month - 1, normalized.day));
  date.setUTCDate(date.getUTCDate() - days);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    ...(normalized.timeZone ? { timeZone: normalized.timeZone } : {}),
  };
}

async function metricSetFreshness({ packageName, setName, token, fetchImpl = fetch }) {
  const response = await fetchImpl(
    `${REPORTING_ROOT}/apps/${encodeURIComponent(packageName)}/${setName}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Play Developer Reporting ${setName} metadata failed (${response.status}).`);
  }
  const body = await response.json();
  const daily = (body.freshnessInfo?.freshnesses ?? []).find(
    (entry) => entry.aggregationPeriod === 'DAILY',
  );
  if (!daily?.latestEndTime) {
    throw new Error(`Play Developer Reporting ${setName} has no DAILY freshness boundary.`);
  }
  return normalizeCivilDateTime(daily.latestEndTime, `${setName} DAILY freshness`);
}

async function queryMetricSet({
  packageName,
  versionCode,
  setName,
  metrics,
  token,
  fetchImpl = fetch,
}) {
  const endTime = await metricSetFreshness({ packageName, setName, token, fetchImpl });
  const startTime = subtractCivilDays(endTime, 7);
  const response = await fetchImpl(
    `${REPORTING_ROOT}/apps/${encodeURIComponent(packageName)}/${setName}:query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timelineSpec: { aggregationPeriod: 'DAILY', startTime, endTime },
        dimensions: ['versionCode'],
        metrics,
        filter: `versionCode = ${versionCode}`,
        userCohort: 'OS_PUBLIC',
        pageSize: 100,
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Play Developer Reporting ${setName} query failed (${response.status}).`);
  }
  return response.json();
}

function civilKey(value) {
  return [value?.year ?? 0, value?.month ?? 0, value?.day ?? 0]
    .map((n) => String(n).padStart(4, '0'))
    .join('-');
}

function latestMetric(body, metricName) {
  const row = [...(body.rows ?? [])]
    .sort((a, b) => civilKey(b.startTime).localeCompare(civilKey(a.startTime)))[0];
  const metric = row?.metrics?.find((entry) => entry.metric === metricName);
  const value = Number(metric?.decimalValue?.value);
  return Number.isFinite(value) ? value : null;
}

export async function readPlayVitals({
  packageName,
  versionCode,
  credentialsPath,
  fetchImpl = fetch,
}) {
  try {
    const token = await reportingToken(credentialsPath, fetchImpl);
    const [crash, anr] = await Promise.all([
      queryMetricSet({
        packageName,
        versionCode,
        setName: 'crashRateMetricSet',
        metrics: ['userPerceivedCrashRate7dUserWeighted', 'distinctUsers'],
        token,
        fetchImpl,
      }),
      queryMetricSet({
        packageName,
        versionCode,
        setName: 'anrRateMetricSet',
        metrics: ['userPerceivedAnrRate7dUserWeighted', 'distinctUsers'],
        token,
        fetchImpl,
      }),
    ]);
    const crashUsers = latestMetric(crash, 'distinctUsers');
    const anrUsers = latestMetric(anr, 'distinctUsers');
    return {
      crashRate: latestMetric(crash, 'userPerceivedCrashRate7dUserWeighted'),
      anrRate: latestMetric(anr, 'userPerceivedAnrRate7dUserWeighted'),
      distinctUsers:
        Number.isFinite(crashUsers) && Number.isFinite(anrUsers)
          ? Math.min(crashUsers, anrUsers)
          : null,
      reportingAvailable: true,
    };
  } catch (error) {
    console.warn(
      `Play vitals unavailable; autonomous promotion is frozen: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { crashRate: null, anrRate: null, distinctUsers: null, reportingAvailable: false };
  }
}

export function parseAutonomousReleaseName(name) {
  const match = /^auto-v1-(\d+)-(\d+)-([0-9a-f]{7})$/i.exec(String(name ?? ''));
  if (!match) return null;
  return {
    versionCode: match[1],
    epochSeconds: Number(match[2]),
    sha7: match[3].toLowerCase(),
  };
}

function selectAutonomousRelease(track, expectedReleaseName = '') {
  const candidates = (track.releases ?? [])
    .map((release) => ({ release, parsed: parseAutonomousReleaseName(release.name) }))
    .filter((entry) => entry.parsed);
  if (expectedReleaseName) {
    return candidates.find((entry) => entry.release.name === expectedReleaseName) ?? null;
  }
  return candidates
    .sort((a, b) => b.parsed.epochSeconds - a.parsed.epochSeconds)[0] ?? null;
}

async function readProductionTrack(client) {
  const edit = await client.createEdit();
  try {
    return await client.getTrack(edit.id, 'production');
  } finally {
    await client.deleteEdit(edit.id);
  }
}

async function mutateRelease(client, releaseName, action, targetFraction) {
  const edit = await client.createEdit();
  let committed = false;
  try {
    const track = await client.getTrack(edit.id, 'production');
    const index = (track.releases ?? []).findIndex((release) => release.name === releaseName);
    if (index < 0) throw new Error('Autonomous production release changed before mutation.');
    const releases = [...(track.releases ?? [])];
    const current = { ...releases[index] };
    if (action === 'halt') {
      current.status = 'halted';
      current.userFraction = targetFraction;
    } else if (action === 'promote') {
      current.status = 'inProgress';
      current.userFraction = targetFraction;
    } else if (action === 'complete') {
      current.status = 'completed';
      delete current.userFraction;
    } else {
      throw new Error(`Unsupported rollout mutation: ${action}`);
    }
    releases[index] = current;
    await client.updateTrack(edit.id, 'production', { ...track, track: 'production', releases });
    await client.commitEdit(edit.id);
    committed = true;
  } finally {
    if (!committed) await client.deleteEdit(edit.id);
  }

  const verified = selectAutonomousRelease(
    await readProductionTrack(client),
    releaseName,
  );
  if (!verified || verified.release.name !== releaseName) {
    throw new Error('Autonomous release was not found during independent rollout readback.');
  }
  const expectedStatus =
    action === 'halt' ? 'halted' : action === 'complete' ? 'completed' : 'inProgress';
  if (verified.release.status !== expectedStatus) {
    throw new Error(
      `Rollout readback status mismatch: expected ${expectedStatus}, got ${verified.release.status}.`,
    );
  }
  if (
    action === 'promote' &&
    Math.abs(Number(verified.release.userFraction) - Number(targetFraction)) > 0.000001
  ) {
    throw new Error('Rollout readback fraction mismatch.');
  }
}

async function backendHealthy(baseUrl, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/v1/health`, {
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function reconcilePlayRollout({
  packageName = process.env.PLAY_PACKAGE_NAME,
  credentialsPath = process.env.PLAY_SERVICE_ACCOUNT_JSON_PATH,
  backendBaseUrl = process.env.BACKEND_BASE_URL ?? 'https://astrology.parsfilo.com',
  expectedReleaseName = process.env.EXPECTED_AUTONOMOUS_RELEASE_NAME ?? '',
  fetchImpl = fetch,
  client: injectedClient,
  now = Date.now,
} = {}) {
  if (!packageName) throw new Error('PLAY_PACKAGE_NAME is required.');
  if (!credentialsPath && !injectedClient) {
    throw new Error('PLAY_SERVICE_ACCOUNT_JSON_PATH is required.');
  }
  const client =
    injectedClient ?? createPlayClient({ packageName, credentialsPath, fetchImpl });
  if (!expectedReleaseName) {
    return {
      action: 'hold',
      reason: 'No machine-recorded autonomous production release provenance is available.',
    };
  }
  if (!parseAutonomousReleaseName(expectedReleaseName)) {
    throw new Error('Machine-recorded autonomous release name is invalid.');
  }
  const selected = selectAutonomousRelease(
    await readProductionTrack(client),
    expectedReleaseName,
  );
  if (!selected) {
    return {
      action: 'hold',
      reason: 'The machine-recorded autonomous production release is not present on Play.',
    };
  }

  const { release, parsed } = selected;
  const fraction =
    release.status === 'completed' ? 1 : Number(release.userFraction ?? 0);
  const ageHours = Math.max(0, (now() / 1000 - parsed.epochSeconds) / 3600);
  const healthOk = await backendHealthy(backendBaseUrl, fetchImpl);

  const vitals =
    release.status === 'inProgress' && healthOk
      ? await readPlayVitals({
          packageName,
          versionCode: parsed.versionCode,
          credentialsPath,
          fetchImpl,
        })
      : { crashRate: null, anrRate: null, distinctUsers: null, reportingAvailable: true };
  const evaluation = healthOk
    ? evaluateVitals(vitals)
    : { state: 'unhealthy', reason: 'Backend health check failed.' };
  const decision = decideRolloutAction({
    status: release.status,
    fraction,
    ageHours,
    vitalsState: evaluation.state,
    healthOk,
  });

  if (['halt', 'promote', 'complete'].includes(decision.action)) {
    await mutateRelease(client, release.name, decision.action, decision.targetFraction);
  }
  return {
    ...decision,
    reason: evaluation.reason,
    releaseName: release.name,
    versionCode: parsed.versionCode,
    status: release.status,
    fraction,
    ageHours,
    vitalsState: evaluation.state,
    crashRate: vitals.crashRate,
    anrRate: vitals.anrRate,
    distinctUsers: vitals.distinctUsers,
  };
}

function writeGithubOutput(result) {
  if (!process.env.GITHUB_OUTPUT) return;
  const values = {
    action: result.action ?? 'hold',
    version_code: result.versionCode ?? '',
    vitals_state: result.vitalsState ?? '',
  };
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''),
  );
}

async function main() {
  const result = await reconcilePlayRollout();
  writeGithubOutput(result);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
