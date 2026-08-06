import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DATABASE_NAME = 'astrology-db';
const TARGET_INDEX = 'idx_fcm_tokens_user_platform_target';
const SCHEMA_QUERY = `
SELECT sql AS table_sql
FROM sqlite_master
WHERE type = 'table' AND name = 'fcm_tokens';
PRAGMA table_info(fcm_tokens);
PRAGMA index_list(fcm_tokens);
PRAGMA index_info(${TARGET_INDEX});
`;
const TARGET_INDEX_COLUMNS = ['user_id', 'platform', 'target_type', 'updated_at'];

export async function reconcileNotificationTargetSchema({
  readState,
  applyMigration,
  createIndex,
}) {
  const before = await readState();
  if (!before?.tableExists) {
    throw new Error('fcm_tokens table is missing; bootstrap schema before deployment.');
  }

  if (before.hasTargetType && !before.isTargetTypeCanonical) {
    throw new Error('target_type definition is not canonical; manual migration is required.');
  }
  if (before.isTargetTypeCanonical && before.isTargetIndexCanonical) {
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
  if (
    !after?.tableExists ||
    !after.hasTargetType ||
    !after.isTargetTypeCanonical ||
    !after.hasTargetIndex ||
    !after.isTargetIndexCanonical
  ) {
    throw new Error('notification target schema reconciliation failed postcondition verification.');
  }
  return outcome;
}

export function parseNotificationTargetState(stdout) {
  const payload = JSON.parse(stdout);
  const entries = Array.isArray(payload) ? payload : [payload];
  const rows = entries.flatMap((entry) => (Array.isArray(entry?.results) ? entry.results : []));
  const tableSql = rows.find((row) => typeof row?.table_sql === 'string')?.table_sql ?? '';
  const columns = rows.filter(
    (row) => Number.isInteger(row?.cid) && typeof row?.name === 'string' && 'type' in row,
  );
  const targetColumn = columns.find((row) => row.name === 'target_type');
  const targetIndex = rows.find(
    (row) =>
      Number.isInteger(row?.seq) &&
      row?.name === TARGET_INDEX &&
      Object.hasOwn(row, 'unique') &&
      Object.hasOwn(row, 'partial'),
  );
  const targetIndexColumns = rows
    .filter((row) => Number.isInteger(row?.seqno) && typeof row?.name === 'string')
    .sort((left, right) => left.seqno - right.seqno)
    .map((row) => row.name);

  const normalizedTableSql = tableSql.toLowerCase().replace(/\s+/g, ' ');
  const hasCanonicalConstraint =
    /target_type\s+text\s+not\s+null\s+default\s+'token'\s+check\s*\(\s*target_type\s+in\s*\(\s*'token'\s*,\s*'fid'\s*\)\s*\)/.test(
      normalizedTableSql,
    );
  const isTargetTypeCanonical =
    Boolean(targetColumn) &&
    String(targetColumn.type).toUpperCase() === 'TEXT' &&
    Number(targetColumn.notnull) === 1 &&
    targetColumn.dflt_value === "'token'" &&
    hasCanonicalConstraint;
  const hasTargetIndex = Boolean(targetIndex);
  const isTargetIndexCanonical =
    hasTargetIndex &&
    Number(targetIndex.unique) === 0 &&
    Number(targetIndex.partial) === 0 &&
    targetIndex.origin === 'c' &&
    targetIndexColumns.length === TARGET_INDEX_COLUMNS.length &&
    targetIndexColumns.every((column, index) => column === TARGET_INDEX_COLUMNS[index]);

  return {
    tableExists: columns.length > 0,
    hasTargetType: Boolean(targetColumn),
    isTargetTypeCanonical,
    hasTargetIndex,
    isTargetIndexCanonical,
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
    `--command=DROP INDEX IF EXISTS ${TARGET_INDEX}; CREATE INDEX ${TARGET_INDEX} ON fcm_tokens(user_id, platform, target_type, updated_at);`,
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
