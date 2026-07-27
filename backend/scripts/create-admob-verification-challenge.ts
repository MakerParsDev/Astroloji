import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DATABASE_NAME = 'astrology-db';
const CONFIG_FILE = 'wrangler.transition.toml';
const VERIFICATION_USER_PREFIX = 'admob-verify-';
const CHALLENGE_TTL_MS = 15 * 60_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface VerificationChallengeValues {
  challengeId: string;
  userId: string;
  identifier: string;
  createdAt: string;
  expiresAt: string;
}

export interface VerificationChallengeRow {
  id: string;
  user_id: string;
  status: string;
  transaction_id: string | null;
  expires_at: string;
}

export type D1CommandResult = Array<{
  results?: unknown[];
  success?: boolean;
  meta?: { changes?: number };
}>;

export type VerificationChallengeCommand = 'create' | 'inspect' | 'delete';

export type VerificationChallengeEvidence =
  | ({ operation: 'create' | 'inspect' } & ReturnType<typeof formatVerificationEvidence>)
  | { operation: 'delete'; deletedChallengePrefix: string };

export interface ExecuteVerificationChallengeCommandOptions {
  command: VerificationChallengeCommand;
  env: Record<string, string | undefined>;
  now?: Date;
  runSql?: (sql: string) => D1CommandResult;
  log?: (message: string) => void;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function requireUuid(value: string, label = 'Challenge ID'): string {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${label} must be a UUID.`);
  }
  return value;
}

function requireEnv(
  env: Record<string, string | undefined>,
  name: 'ADMOB_SSV_TEST_USER_ID' | 'ADMOB_SSV_TEST_CUSTOM_DATA'
): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

export function validateSuppliedVerificationValues(userId: string, challengeId: string) {
  const normalizedChallengeId = requireUuid(challengeId.trim(), 'Custom data');
  const normalizedUserId = userId.trim();
  if (!normalizedUserId.startsWith(VERIFICATION_USER_PREFIX)) {
    throw new Error('User ID must use the admob-verify-<uuid> namespace.');
  }
  const userUuid = normalizedUserId.slice(VERIFICATION_USER_PREFIX.length);
  if (!UUID_PATTERN.test(userUuid)) {
    throw new Error('User ID must use the admob-verify-<uuid> namespace.');
  }
  return { userId: normalizedUserId, challengeId: normalizedChallengeId };
}

export function createVerificationChallengeValues(options: {
  now?: Date;
  randomUUID?: () => string;
} = {}): VerificationChallengeValues {
  const now = options.now ?? new Date();
  const randomUUID = options.randomUUID ?? crypto.randomUUID;
  const challengeId = randomUUID();
  const userId = `${VERIFICATION_USER_PREFIX}${randomUUID()}`;
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);

  return {
    challengeId,
    userId,
    identifier: now.toISOString().slice(0, 10),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  };
}

export function createSuppliedVerificationChallengeValues(options: {
  userId: string;
  challengeId: string;
  now?: Date;
}): VerificationChallengeValues {
  const { userId, challengeId } = validateSuppliedVerificationValues(
    options.userId,
    options.challengeId
  );
  const now = options.now ?? new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
  return {
    challengeId,
    userId,
    identifier: now.toISOString().slice(0, 10),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  };
}

export function buildInsertVerificationChallengeSql(values: VerificationChallengeValues): string {
  return `INSERT OR IGNORE INTO users
(id, firebase_uid, sign, language, utc_offset, is_premium, subscription_state,
 premium_expires_at, created_at, last_seen_at)
VALUES (${sqlString(values.userId)}, NULL, 'aries', 'tr', 0, 0, 'none', NULL,
 ${sqlString(values.createdAt)}, ${sqlString(values.createdAt)});
INSERT INTO reward_challenges
(id, user_id, reward_type, identifier, status, transaction_id, ad_unit,
 callback_timestamp_ms, created_at, expires_at, verified_at, consumed_at,
 entitlement_expires_at)
VALUES (${sqlString(values.challengeId)}, ${sqlString(values.userId)}, 'daily', ${sqlString(values.identifier)}, 'pending', NULL, NULL, NULL, ${sqlString(values.createdAt)}, ${sqlString(values.expiresAt)}, NULL, NULL, NULL);`;
}

export function buildSelectVerificationChallengeSql(challengeId: string): string {
  return `SELECT id, user_id, status, transaction_id, expires_at
FROM reward_challenges
WHERE id = ${sqlString(requireUuid(challengeId))}
  AND user_id LIKE 'admob-verify-%'
LIMIT 1;`;
}

export function buildDeleteVerificationChallengeSql(
  challengeId: string,
  userId: string
): string {
  const supplied = validateSuppliedVerificationValues(userId, challengeId);
  return `DELETE FROM reward_challenges
WHERE id = ${sqlString(supplied.challengeId)}
  AND user_id = ${sqlString(supplied.userId)}
  AND user_id LIKE 'admob-verify-%';
DELETE FROM users
WHERE id = ${sqlString(supplied.userId)}
  AND id LIKE 'admob-verify-%'
  AND NOT EXISTS (
    SELECT 1 FROM reward_challenges
    WHERE user_id = ${sqlString(supplied.userId)}
  );`;
}

export function formatVerificationEvidence(row: VerificationChallengeRow) {
  return {
    challengePrefix: row.id.slice(0, 8),
    userPrefix: row.user_id.startsWith(VERIFICATION_USER_PREFIX)
      ? VERIFICATION_USER_PREFIX
      : 'unexpected',
    status: row.status,
    transactionPrefix: row.transaction_id?.slice(0, 8) ?? null,
    expiresAt: row.expires_at
  };
}

export function runRemoteSql(sql: string): D1CommandResult {
  const output = execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      DATABASE_NAME,
      '--remote',
      '--config',
      CONFIG_FILE,
      '--command',
      sql,
      '--json'
    ],
    {
      cwd: path.resolve('.'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      timeout: 120_000
    }
  );
  return JSON.parse(output) as D1CommandResult;
}

function firstRow(result: D1CommandResult): VerificationChallengeRow | null {
  const row = result.flatMap((item) => item.results ?? [])[0];
  return row ? (row as VerificationChallengeRow) : null;
}

export function executeVerificationChallengeCommand({
  command,
  env,
  now,
  runSql = runRemoteSql,
  log = console.log
}: ExecuteVerificationChallengeCommandOptions): VerificationChallengeEvidence {
  if (command === 'create') {
    const userId = requireEnv(env, 'ADMOB_SSV_TEST_USER_ID');
    const challengeId = requireEnv(env, 'ADMOB_SSV_TEST_CUSTOM_DATA');
    const values = createSuppliedVerificationChallengeValues({ userId, challengeId, now });
    runSql(buildInsertVerificationChallengeSql(values));
    const evidence: VerificationChallengeEvidence = {
      operation: 'create',
      ...formatVerificationEvidence({
        id: values.challengeId,
        user_id: values.userId,
        status: 'pending',
        transaction_id: null,
        expires_at: values.expiresAt
      })
    };
    log(JSON.stringify(evidence));
    return evidence;
  }

  const challengeId = requireUuid(
    requireEnv(env, 'ADMOB_SSV_TEST_CUSTOM_DATA'),
    'Custom data'
  );

  if (command === 'inspect') {
    const row = firstRow(runSql(buildSelectVerificationChallengeSql(challengeId)));
    if (!row || !row.user_id.startsWith(VERIFICATION_USER_PREFIX)) {
      throw new Error('AdMob verification challenge was not found.');
    }
    const evidence: VerificationChallengeEvidence = {
      operation: 'inspect',
      ...formatVerificationEvidence(row)
    };
    log(JSON.stringify(evidence));
    return evidence;
  }

  const userId = requireEnv(env, 'ADMOB_SSV_TEST_USER_ID');
  runSql(buildDeleteVerificationChallengeSql(challengeId, userId));
  const evidence: VerificationChallengeEvidence = {
    operation: 'delete',
    deletedChallengePrefix: challengeId.slice(0, 8)
  };
  log(JSON.stringify(evidence));
  return evidence;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (rest.length > 0 || !['create', 'inspect', 'delete'].includes(command ?? '')) {
    throw new Error('Usage: create | inspect | delete');
  }
  executeVerificationChallengeCommand({
    command: command as VerificationChallengeCommand,
    env: process.env
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
