import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const moduleUrl = new URL('../backend/scripts/reconcile-notification-targets.mjs', import.meta.url);
const reconciler = existsSync(moduleUrl) ? await import(moduleUrl) : {};

function state({
  targetType = false,
  targetTypeCanonical = targetType,
  index = false,
  indexCanonical = index,
} = {}) {
  return {
    tableExists: true,
    hasTargetType: targetType,
    isTargetTypeCanonical: targetTypeCanonical,
    hasTargetIndex: index,
    isTargetIndexCanonical: indexCanonical,
  };
}

test('legacy notification schema applies the historical migration and verifies the result', async () => {
  assert.equal(typeof reconciler.reconcileNotificationTargetSchema, 'function');
  const states = [state(), state({ targetType: true, index: true })];
  const calls = [];

  const result = await reconciler.reconcileNotificationTargetSchema({
    readState: async () => states.shift(),
    applyMigration: async () => calls.push('migration'),
    createIndex: async () => calls.push('index'),
  });

  assert.equal(result, 'applied');
  assert.deepEqual(calls, ['migration']);
});

test('partial notification schema creates only the missing index', async () => {
  assert.equal(typeof reconciler.reconcileNotificationTargetSchema, 'function');
  const states = [
    state({ targetType: true }),
    state({ targetType: true, index: true }),
  ];
  const calls = [];

  const result = await reconciler.reconcileNotificationTargetSchema({
    readState: async () => states.shift(),
    applyMigration: async () => calls.push('migration'),
    createIndex: async () => calls.push('index'),
  });

  assert.equal(result, 'index_repaired');
  assert.deepEqual(calls, ['index']);
});

test('malformed named index is rebuilt with the canonical key order', async () => {
  assert.equal(typeof reconciler.reconcileNotificationTargetSchema, 'function');
  const states = [
    state({ targetType: true, index: true, indexCanonical: false }),
    state({ targetType: true, index: true }),
  ];
  const calls = [];

  const result = await reconciler.reconcileNotificationTargetSchema({
    readState: async () => states.shift(),
    applyMigration: async () => calls.push('migration'),
    createIndex: async () => calls.push('index'),
  });

  assert.equal(result, 'index_repaired');
  assert.deepEqual(calls, ['index']);
});

test('malformed target_type definition fails without mutating production', async () => {
  assert.equal(typeof reconciler.reconcileNotificationTargetSchema, 'function');
  const calls = [];

  await assert.rejects(
    () =>
      reconciler.reconcileNotificationTargetSchema({
        readState: async () =>
          state({
            targetType: true,
            targetTypeCanonical: false,
            index: true,
          }),
        applyMigration: async () => calls.push('migration'),
        createIndex: async () => calls.push('index'),
      }),
    /target_type definition is not canonical/,
  );
  assert.deepEqual(calls, []);
});

test('current notification schema performs no mutation', async () => {
  assert.equal(typeof reconciler.reconcileNotificationTargetSchema, 'function');
  const calls = [];

  const result = await reconciler.reconcileNotificationTargetSchema({
    readState: async () => state({ targetType: true, index: true }),
    applyMigration: async () => calls.push('migration'),
    createIndex: async () => calls.push('index'),
  });

  assert.equal(result, 'present');
  assert.deepEqual(calls, []);
});

test('reconciliation fails closed when the table is missing or the postcondition is incomplete', async () => {
  assert.equal(typeof reconciler.reconcileNotificationTargetSchema, 'function');

  await assert.rejects(
    () =>
      reconciler.reconcileNotificationTargetSchema({
        readState: async () => ({
          tableExists: false,
          hasTargetType: false,
          isTargetTypeCanonical: false,
          hasTargetIndex: false,
          isTargetIndexCanonical: false,
        }),
        applyMigration: async () => {},
        createIndex: async () => {},
      }),
    /fcm_tokens table is missing/,
  );

  const states = [state(), state({ targetType: true })];
  await assert.rejects(
    () =>
      reconciler.reconcileNotificationTargetSchema({
        readState: async () => states.shift(),
        applyMigration: async () => {},
        createIndex: async () => {},
      }),
    /notification target schema reconciliation failed/,
  );
});

test('wrangler metadata parser validates canonical column constraints and index order', () => {
  assert.equal(typeof reconciler.parseNotificationTargetState, 'function');
  const canonicalPayload = [
    {
      results: [
        {
          table_sql:
            "CREATE TABLE fcm_tokens (id TEXT PRIMARY KEY, target_type TEXT NOT NULL DEFAULT 'token' CHECK (target_type IN ('token', 'fid'))) ",
        },
        { cid: 0, name: 'id', type: 'TEXT', notnull: 0, dflt_value: null, pk: 1 },
        { cid: 3, name: 'target_type', type: 'TEXT', notnull: 1, dflt_value: "'token'", pk: 0 },
        { seq: 0, name: 'idx_fcm_tokens_user_platform_target', unique: 0, origin: 'c', partial: 0 },
        { seqno: 0, cid: 1, name: 'user_id' },
        { seqno: 1, cid: 4, name: 'platform' },
        { seqno: 2, cid: 3, name: 'target_type' },
        { seqno: 3, cid: 8, name: 'updated_at' },
      ],
    },
  ];

  assert.deepEqual(
    reconciler.parseNotificationTargetState(JSON.stringify(canonicalPayload)),
    state({ targetType: true, index: true }),
  );

  const malformedPayload = structuredClone(canonicalPayload);
  malformedPayload[0].results[0].table_sql = malformedPayload[0].results[0].table_sql.replace(
    "CHECK (target_type IN ('token', 'fid'))",
    '',
  );
  malformedPayload[0].results[5].name = 'target_type';
  malformedPayload[0].results[6].name = 'platform';
  const malformedState = reconciler.parseNotificationTargetState(JSON.stringify(malformedPayload));
  assert.equal(malformedState.hasTargetType, true);
  assert.equal(malformedState.isTargetTypeCanonical, false);
  assert.equal(malformedState.hasTargetIndex, true);
  assert.equal(malformedState.isTargetIndexCanonical, false);
});

test('production workflow reconciles notification targets before tracked migrations and deploy', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/backend-production-deploy.yml', import.meta.url),
    'utf8',
  );
  const reconcile = workflow.indexOf('node scripts/reconcile-notification-targets.mjs');
  const tracked = workflow.indexOf('npx wrangler d1 migrations apply astrology-db --remote');
  const deploy = workflow.indexOf('npm run deploy:doppler');

  assert.notEqual(reconcile, -1);
  assert.notEqual(tracked, -1);
  assert.notEqual(deploy, -1);
  assert.ok(reconcile < tracked);
  assert.ok(tracked < deploy);
});
