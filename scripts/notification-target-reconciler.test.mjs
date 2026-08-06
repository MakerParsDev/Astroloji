import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const moduleUrl = new URL('../backend/scripts/reconcile-notification-targets.mjs', import.meta.url);
const reconciler = existsSync(moduleUrl) ? await import(moduleUrl) : {};

function state({ targetType = false, index = false } = {}) {
  return {
    tableExists: true,
    hasTargetType: targetType,
    hasTargetIndex: index,
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
        readState: async () => ({ tableExists: false, hasTargetType: false, hasTargetIndex: false }),
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
