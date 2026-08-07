import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  buildLocaleCleanupPlan,
  cleanupConfirmation,
  executeLocaleCleanup,
} from './cleanup-play-locales.mjs';
import { computePlayStateDigest } from './lib/play-diff.mjs';

function backupFixture({ rollout = 0.1, locales = ['de-DE', 'en-US', 'fr-FR', 'tr-TR'] } = {}) {
  return {
    schemaVersion: 1,
    capturedAt: '2026-08-06T15:00:00.000Z',
    packageName: 'com.parsfilo.astrology',
    listings: locales.map((locale) => ({
      locale,
      title: `Title ${locale}`,
      shortDescription: `Short ${locale}`,
      fullDescription: `Full ${locale}`,
      images: { icon: [], featureGraphic: [], phoneScreenshots: [] },
    })),
    tracks: {
      production: {
        track: 'production',
        releases: [{ status: rollout === 1 ? 'completed' : 'inProgress', userFraction: rollout === 1 ? null : rollout, versionCodes: ['1102'] }],
      },
      internal: { track: 'internal', releases: [{ status: 'completed', versionCodes: ['1101'] }] },
    },
    subscriptions: [
      { productId: 'premium_monthly', basePlans: [{ basePlanId: 'monthly', state: 'ACTIVE' }] },
      { productId: 'premium_weekly', basePlans: [{ basePlanId: 'weekly', state: 'ACTIVE' }] },
    ],
  };
}

function fileDigest(backup) {
  return crypto.createHash('sha256').update(JSON.stringify(backup)).digest('hex');
}

function buildValidPlan(overrides = {}) {
  const backup = backupFixture();
  const current = structuredClone(backup);
  const backupDigest = fileDigest(backup);
  const stateDigest = computePlayStateDigest(current);
  return buildLocaleCleanupPlan({
    backup,
    current,
    supportedLocales: ['en-US', 'tr-TR'],
    expectedRolloutFraction: 0.1,
    expectedStateDigest: stateDigest,
    expectedBackupDigest: backupDigest,
    actualBackupDigest: backupDigest,
    expectedRemovalCount: 2,
    ...overrides,
  });
}

test('cleanup plan is digest-bound and lists only unsupported locales', () => {
  const plan = buildValidPlan();
  assert.deepEqual(plan.blockingErrors, []);
  assert.deepEqual(plan.localesToRemove, ['de-DE', 'fr-FR']);
  assert.equal(
    plan.confirmation,
    cleanupConfirmation(2, plan.stateDigest),
  );
  assert.match(plan.confirmation, /^REMOVE_2_UNSUPPORTED_PLAY_LOCALES_[0-9a-f]{12}$/);
});

test('cleanup refuses backup and current locale count drift', () => {
  const current = backupFixture({ locales: ['de-DE', 'en-US', 'tr-TR'] });
  const plan = buildValidPlan({ current, expectedStateDigest: computePlayStateDigest(current) });
  assert.ok(plan.blockingErrors.some((error) => /backup locale count/i.test(error)));
});

test('cleanup refuses live state digest drift', () => {
  const plan = buildValidPlan({ expectedStateDigest: 'f'.repeat(64) });
  assert.ok(plan.blockingErrors.some((error) => /live state digest/i.test(error)));
});

test('cleanup refuses missing supported locales', () => {
  const backup = backupFixture({ locales: ['de-DE', 'en-US', 'fr-FR'] });
  const current = structuredClone(backup);
  const digest = fileDigest(backup);
  const plan = buildLocaleCleanupPlan({
    backup,
    current,
    supportedLocales: ['en-US', 'tr-TR'],
    expectedRolloutFraction: 0.1,
    expectedStateDigest: computePlayStateDigest(current),
    expectedBackupDigest: digest,
    actualBackupDigest: digest,
    expectedRemovalCount: 2,
  });
  assert.ok(plan.blockingErrors.some((error) => /supported locale.*tr-TR/i.test(error)));
});

test('cleanup refuses removal-count and backup checksum mismatch', () => {
  const plan = buildValidPlan({
    expectedRemovalCount: 3,
    expectedBackupDigest: '0'.repeat(64),
  });
  assert.ok(plan.blockingErrors.some((error) => /removal count/i.test(error)));
  assert.ok(plan.blockingErrors.some((error) => /backup checksum/i.test(error)));
});

test('cleanup refuses production rollout other than ten percent', () => {
  const current = backupFixture({ rollout: 1 });
  const backup = structuredClone(current);
  const digest = fileDigest(backup);
  const plan = buildLocaleCleanupPlan({
    backup,
    current,
    supportedLocales: ['en-US', 'tr-TR'],
    expectedRolloutFraction: 0.1,
    expectedStateDigest: computePlayStateDigest(current),
    expectedBackupDigest: digest,
    actualBackupDigest: digest,
    expectedRemovalCount: 2,
  });
  assert.ok(plan.blockingErrors.some((error) => /production rollout/i.test(error)));
  assert.equal(plan.confirmation, null);
});

test('execute cleanup deletes only frozen unsupported locales and independently verifies two remain', async () => {
  const current = backupFixture();
  const plan = buildValidPlan();
  const calls = [];
  let editLocales = current.listings.map((listing) => listing.locale);
  const client = {
    packageName: current.packageName,
    async createEdit() {
      calls.push(['createEdit']);
      return { id: 'cleanup-edit' };
    },
    async listListings() {
      return editLocales.map((language) => ({ language }));
    },
    async getListing(_editId, locale) {
      return current.listings.find((listing) => listing.locale === locale);
    },
    async deleteListing(editId, locale) {
      calls.push(['deleteListing', editId, locale]);
      editLocales = editLocales.filter((value) => value !== locale);
      return {};
    },
    async commitEdit(editId) {
      calls.push(['commitEdit', editId]);
      return {};
    },
    async deleteEdit(editId) {
      calls.push(['deleteEdit', editId]);
      return {};
    },
  };
  let readbackCalls = 0;
  await executeLocaleCleanup({
    client,
    current,
    plan,
    confirmation: plan.confirmation,
    independentReadback: async () => {
      readbackCalls += 1;
      return [];
    },
  });
  assert.deepEqual(
    calls.filter((call) => call[0] === 'deleteListing').map((call) => call[2]),
    ['de-DE', 'fr-FR'],
  );
  assert.ok(calls.some((call) => call[0] === 'commitEdit'));
  assert.ok(!calls.some((call) => call[0] === 'deleteEdit'));
  assert.equal(readbackCalls, 1);
});

test('execute cleanup rejects wrong confirmation before creating an edit', async () => {
  const current = backupFixture();
  const plan = buildValidPlan();
  let creates = 0;
  const client = {
    packageName: current.packageName,
    async createEdit() {
      creates += 1;
      return { id: 'unexpected' };
    },
  };
  await assert.rejects(
    executeLocaleCleanup({
      client,
      current,
      plan,
      confirmation: 'REMOVE_WRONG',
      independentReadback: async () => [],
    }),
    /confirmation mismatch/i,
  );
  assert.equal(creates, 0);
});
