import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DATABASE_NAME = 'astrology-db';
const TARGET_INDEX = 'idx_fcm_tokens_user_platform_target';
const SCHEMA_QUERY = `
PRAGMA table_info(fcm_tokens);
SELECT name AS index_name
FROM sqlite_master
WHERE type = 'index' AND name = '${TARGET_INDEX}';
`;

export async function reconcileNotificationTargetSchema({
  readState,
  applyMigration,
  createIndex,
}) {
  const before = await readState();
  if (!before?.tableExists) {
    throw new Error('fcm_tokens table is missing; bootstrap schema before deployment.');
  }

  if (before.hasTargetType && before.hasTargetIndex) {
    return 'present';
  }

  let outcome;
  if (!before.hasTargetType) {
    await applyMigration();
    outcome = 'applied';
  } else {
    await createIndex();
    outcome = 'index_repaired';
  }

  const after = await readState();
  if (!after?.tableExists || !after.hasTargetType || !after.hasTargetIndex) {
    throw new Error('notification target schema reconciliation failed postcondition verification.');
  }
  return outcome;
}

export function parseNotificationTargetState(stdout) {
  const payload = JSON.parse(stdout);
  const entries = Array.isArray(payload) ? payload : [payload];
  const rows = entries.flatMap((entry) => (Array.isArray(entry?.results) ? entry.results : []));
  const columns = rows.filter((row) => Number.isInteger(row?.cid) && typeof row?.name === 'string');
  const indexes = rows.filter((row) => typeof row?.index_name === 'string');

  return {
    tableExists: columns.length > 0,
    hasTargetType: columns.some((row) => row.name === 'target_type'),
    hasTargetIndex: indexes.some((row) => row.index_name === TARGET_INDEX),
  };
}

function runWrangler(args, { capture = false } = {}) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(executable, ['wrangler', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`wrangler command failed with exit code ${result.status ?? 'unknown'}.`);
  }
  return capture ? result.stdout : '';
}

async function readRemoteState() {
  const stdout = runWrangler(
    ['d1', 'execute', DATABASE_NAME, '--remote', `--command=${SCHEMA_QUERY}`, '--json'],
    { capture: true },
  );
  return parseNotificationTargetState(stdout);
}

async function applyHistoricalMigration() {
  runWrangler([
    'd1',
    'execute',
    DATABASE_NAME,
    '--remote',
    '--file=scripts/migrate-notification-targets.sql',
  ]);
}

async function createMissingIndex() {
  runWrangler([
    'd1',
    'execute',
    DATABASE_NAME,
    '--remote',
    `--command=CREATE INDEX IF NOT EXISTS ${TARGET_INDEX} ON fcm_tokens(user_id, platform, target_type, updated_at);`,
  ]);
}

async function main() {
  const result = await reconcileNotificationTargetSchema({
    readState: readRemoteState,
    applyMigration: applyHistoricalMigration,
    createIndex: createMissingIndex,
  });
  console.log(`notification_target_schema=${result}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'notification target reconciliation failed.');
    process.exitCode = 1;
  });
}
