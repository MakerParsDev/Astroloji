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

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function requireUuid(value: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new Error('Challenge ID must be a UUID.');
  }
  return value;
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

export function buildInsertVerificationChallengeSql(values: VerificationChallengeValues): string {
  return `INSERT INTO reward_challenges
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

export function buildDeleteVerificationChallengeSql(challengeId: string): string {
  return `DELETE FROM reward_challenges
WHERE id = ${sqlString(requireUuid(challengeId))}
  AND user_id LIKE 'admob-verify-%';`;
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

type D1CommandResult = Array<{
  results?: unknown[];
  success?: boolean;
  meta?: { changes?: number };
}>;

function runRemoteSql(sql: string): D1CommandResult {
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
      stdio: ['ignore', 'pipe', 'inherit']
    }
  );
  return JSON.parse(output) as D1CommandResult;
}

function firstRow(result: D1CommandResult): VerificationChallengeRow | null {
  const row = result.flatMap((item) => item.results ?? [])[0];
  return row ? (row as VerificationChallengeRow) : null;
}

function createChallenge(): void {
  const values = createVerificationChallengeValues();
  runRemoteSql(buildInsertVerificationChallengeSql(values));
  console.log('SHORT-LIVED ADMOB TEST VALUES — do not paste into tickets or GitHub logs.');
  console.log(`User ID: ${values.userId}`);
  console.log(`Custom data: ${values.challengeId}`);
  console.log(`Expires at (UTC): ${values.expiresAt}`);
}

function inspectChallenge(challengeId: string): void {
  const row = firstRow(runRemoteSql(buildSelectVerificationChallengeSql(challengeId)));
  if (!row) {
    throw new Error('AdMob verification challenge was not found.');
  }
  console.log(JSON.stringify(formatVerificationEvidence(row), null, 2));
}

function deleteChallenge(challengeId: string): void {
  runRemoteSql(buildDeleteVerificationChallengeSql(challengeId));
  console.log(JSON.stringify({ deletedChallengePrefix: requireUuid(challengeId).slice(0, 8) }));
}

async function main(): Promise<void> {
  const [command, challengeId] = process.argv.slice(2);
  if (command === 'create') {
    createChallenge();
    return;
  }
  if (command === 'inspect' && challengeId) {
    inspectChallenge(challengeId);
    return;
  }
  if (command === 'delete' && challengeId) {
    deleteChallenge(challengeId);
    return;
  }
  throw new Error('Usage: create | inspect <challenge-uuid> | delete <challenge-uuid>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
