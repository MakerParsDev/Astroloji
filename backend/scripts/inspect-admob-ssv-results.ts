import { pathToFileURL } from 'node:url';

const SSV_MESSAGE = 'Reward SSV result.';
const DEFAULT_WORKER = 'astrology-ssv-transition';
const DEFAULT_LOOKBACK_MINUTES = 360;
const DEFAULT_LIMIT = 20;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const WORKER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const OUTCOMES = [
  'signature_rejected',
  'verified',
  'duplicate_callback',
  'transaction_replay',
  'unknown_challenge',
  'expired_challenge',
  'user_mismatch',
  'ad_unit_mismatch',
  'timestamp_rejected'
] as const;

const VERIFIER_CODES = [
  'MALFORMED_CALLBACK',
  'INVALID_SIGNATURE',
  'UNKNOWN_KEY',
  'KEY_FETCH_FAILED'
] as const;

type UnknownRecord = Record<string, unknown>;
type SsvOutcome = (typeof OUTCOMES)[number];
type VerifierCode = (typeof VERIFIER_CODES)[number];

export interface WorkerSsvEvidence {
  operation: 'callback';
  status: 'found' | 'no_events';
  timestamp: string | null;
  scriptName: string;
  outcome: SsvOutcome | null;
  verifierCode: VerifierCode | null;
  scriptVersion: string | null;
}

export interface ExecuteWorkerSsvInspectionOptions {
  env: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  nowMs?: number;
  log?: (message: string) => void;
}

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function string(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  return typeof value === 'string' && allowed.includes(value as T[number])
    ? (value as T[number])
    : null;
}

function requireEnv(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error('Telemetry bounds must be integers.');
  return parsed;
}

/** Builds a bounded Cloudflare Workers telemetry query for redacted SSV result events. */
export function buildWorkerSsvTelemetryQuery(
  workerName: string,
  lookbackMinutes: number,
  limit: number,
  nowMs = Date.now()
) {
  if (!WORKER_PATTERN.test(workerName)) throw new Error('Worker script name is invalid.');
  if (!Number.isInteger(lookbackMinutes) || lookbackMinutes < 1 || lookbackMinutes > 3600) {
    throw new Error('Telemetry lookback must be an integer from 1 to 3600 minutes.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('Telemetry limit must be an integer from 1 to 50.');
  }
  if (!Number.isFinite(nowMs) || nowMs < 0) throw new Error('Telemetry clock is invalid.');

  return {
    queryId: 'astrology-worker-ssv-results',
    timeframe: { from: nowMs - lookbackMinutes * 60_000, to: nowMs },
    dry: true,
    limit,
    parameters: {
      datasets: ['cloudflare-workers'],
      filterCombination: 'and',
      filters: [
        { key: '$metadata.service', operation: 'eq', type: 'string', value: workerName },
        { key: '$metadata.message', operation: 'eq', type: 'string', value: SSV_MESSAGE }
      ],
      view: 'events'
    }
  };
}

function workerEnvelope(event: UnknownRecord, source: UnknownRecord): UnknownRecord {
  const direct = record(event.$workers);
  return Object.keys(direct).length ? direct : record(source.$workers);
}

/** Converts raw telemetry into one latest allowlisted callback evidence record. */
export function parseWorkerSsvTelemetry(
  value: unknown,
  expectedWorkerName: string,
  limit: number
): WorkerSsvEvidence {
  const root = record(value);
  const container = record(root.events);
  const candidates = records(container.events)
    .map((event) => {
      const source = record(event.source);
      const metadata = record(event.$metadata);
      const workers = workerEnvelope(event, source);
      const scriptName = string(workers.scriptName) ?? string(metadata.service);
      const message = string(metadata.message) ?? string(source.message);
      const timestamp = event.timestamp;
      if (
        scriptName !== expectedWorkerName ||
        message !== SSV_MESSAGE ||
        typeof timestamp !== 'number' ||
        !Number.isFinite(timestamp) ||
        timestamp < 0
      ) {
        return null;
      }
      const date = new Date(timestamp);
      if (!Number.isFinite(date.getTime())) return null;
      const version = string(record(workers.scriptVersion).id);
      return {
        timestamp: date.toISOString(),
        scriptName: expectedWorkerName,
        outcome: enumValue(source.outcome, OUTCOMES),
        verifierCode: enumValue(source.verifierCode, VERIFIER_CODES),
        scriptVersion: version && UUID_PATTERN.test(version) ? version : null
      };
    })
    .filter((event): event is NonNullable<typeof event> => event !== null)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);

  const latest = candidates[0];
  return latest
    ? { operation: 'callback', status: 'found', ...latest }
    : {
        operation: 'callback',
        status: 'no_events',
        timestamp: null,
        scriptName: expectedWorkerName,
        outcome: null,
        verifierCode: null,
        scriptVersion: null
      };
}

/** Queries Cloudflare telemetry and emits only strict redacted callback evidence. */
export async function executeWorkerSsvInspection({
  env,
  fetchImpl = fetch,
  nowMs = Date.now(),
  log = console.log
}: ExecuteWorkerSsvInspectionOptions): Promise<WorkerSsvEvidence> {
  const apiToken = requireEnv(env, 'CLOUDFLARE_API_TOKEN');
  const accountId = requireEnv(env, 'CLOUDFLARE_ACCOUNT_ID');
  const workerName = env.SSV_WORKER_NAME?.trim() || DEFAULT_WORKER;
  const lookbackMinutes = parseInteger(env.SSV_LOOKBACK_MINUTES, DEFAULT_LOOKBACK_MINUTES);
  const limit = parseInteger(env.SSV_RESULT_LIMIT, DEFAULT_LIMIT);
  const requestTimeoutMs = parseInteger(
    env.SSV_REQUEST_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS
  );
  if (requestTimeoutMs < 1_000 || requestTimeoutMs > 30_000) {
    throw new Error('Telemetry request timeout must be an integer from 1000 to 30000 ms.');
  }
  const query = buildWorkerSsvTelemetryQuery(workerName, lookbackMinutes, limit, nowMs);
  let response: Response;
  try {
    response = await fetchImpl(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/observability/telemetry/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(query),
        signal: AbortSignal.timeout(requestTimeoutMs)
      }
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : 'request failed';
    throw new Error(`Cloudflare telemetry query failed: ${reason}`);
  }

  let payload: {
    success?: boolean;
    result?: unknown;
    errors?: Array<{ message?: string }>;
  };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new Error(`Cloudflare telemetry query failed: invalid JSON response (${response.status})`);
  }
  if (!response.ok || payload.success !== true) {
    throw new Error(
      `Cloudflare telemetry query failed: ${payload.errors?.[0]?.message ?? response.status}`
    );
  }
  const evidence = parseWorkerSsvTelemetry(payload.result, workerName, limit);
  log(JSON.stringify(evidence));
  return evidence;
}

async function main() {
  await executeWorkerSsvInspection({ env: process.env });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
