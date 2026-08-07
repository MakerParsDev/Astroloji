import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { capturePlayBackup, verifyLiveState } from './lib/play-backup.mjs';

function fakeClient() {
  return {
    packageName: 'com.parsfilo.astrology',
    async createEdit() {
      return { id: 'edit-read' };
    },
    async listListings() {
      return [{ language: 'en-US' }, { language: 'tr-TR' }];
    },
    async getListing(_editId, locale) {
      return {
        language: locale,
        title: locale === 'tr-TR' ? 'Astroloji' : 'Astrology',
        shortDescription: `${locale} short`,
        fullDescription: `${locale} full`,
      };
    },
    async listImages(_editId, locale, imageType) {
      return [{ id: `${locale}-${imageType}-1`, sha1: 'abc123', url: 'https://example.invalid/image.png' }];
    },
    async getTrack(_editId, track) {
      return {
        track,
        releases: track === 'production'
          ? [{ status: 'inProgress', userFraction: 0.1, versionCodes: ['1102'], name: 'Astroloji 1.0.101' }]
          : [{ status: 'completed', versionCodes: ['1101'], name: '1.0.101-internal' }],
      };
    },
    async listSubscriptions() {
      return [
        { productId: 'premium_monthly', basePlans: [{ basePlanId: 'monthly', state: 'ACTIVE' }] },
        { productId: 'premium_weekly', basePlans: [{ basePlanId: 'weekly', state: 'ACTIVE' }] },
      ];
    },
    async deleteEdit(editId) {
      assert.equal(editId, 'edit-read');
    },
  };
}

test('backup captures listings, images, tracks, and subscription identifiers without secrets', async () => {
  const backup = await capturePlayBackup(fakeClient(), { now: () => '2026-08-06T12:00:00.000Z' });
  assert.equal(backup.schemaVersion, 1);
  assert.equal(backup.packageName, 'com.parsfilo.astrology');
  assert.equal(backup.capturedAt, '2026-08-06T12:00:00.000Z');
  assert.deepEqual(backup.listings.map((listing) => listing.locale), ['en-US', 'tr-TR']);
  assert.equal(backup.listings[0].images.phoneScreenshots.length, 1);
  assert.equal(backup.tracks.production.releases[0].userFraction, 0.1);
  assert.deepEqual(backup.subscriptions, [
    { productId: 'premium_monthly', basePlans: [{ basePlanId: 'monthly', state: 'ACTIVE' }] },
    { productId: 'premium_weekly', basePlans: [{ basePlanId: 'weekly', state: 'ACTIVE' }] },
  ]);

  const serialized = JSON.stringify(backup);
  assert.doesNotMatch(serialized, /access[_-]?token|private[_-]?key|credentialPath|tester.*@/i);
});

test('independent readback reports rollout and subscription drift', async () => {
  const errors = await verifyLiveState(fakeClient(), {
    locales: ['en-US', 'tr-TR'],
    productionRolloutFraction: 0.25,
    subscriptions: [
      { productId: 'premium_monthly', basePlanId: 'monthly' },
      { productId: 'premium_yearly', basePlanId: 'yearly' },
    ],
  });
  assert.ok(errors.some((error) => /rollout fraction/i.test(error)));
  assert.ok(errors.some((error) => /premium_yearly\/yearly/i.test(error)));
  assert.ok(errors.some((error) => /premium_weekly\/weekly/i.test(error)));
});

test('independent readback passes for the canonical two-locale catalog and ten percent rollout', async () => {
  const errors = await verifyLiveState(fakeClient(), {
    locales: ['en-US', 'tr-TR'],
    productionRolloutFraction: 0.1,
    subscriptions: [
      { productId: 'premium_monthly', basePlanId: 'monthly' },
      { productId: 'premium_weekly', basePlanId: 'weekly' },
    ],
  });
  assert.deepEqual(errors, []);
});

test('backup CLI requires an absolute output path outside the repository', async () => {
  const { assertSafeOutputPath } = await import('./backup-play-metadata.mjs');
  assert.throws(() => assertSafeOutputPath('relative.json', process.cwd()), /must be absolute/i);
  assert.throws(
    () => assertSafeOutputPath(`${process.cwd()}/private/play.json`, process.cwd()),
    /outside the repository/i,
  );
  const outsidePath = path.join(os.tmpdir(), 'astro-play-backup.json');
  assert.equal(
    assertSafeOutputPath(outsidePath, process.cwd()),
    path.resolve(outsidePath),
  );
});

test('backup preserves an explicit default locale for future restore verification', async () => {
  const backup = await capturePlayBackup(fakeClient(), {
    now: () => '2026-08-06T12:00:00.000Z',
    defaultLocale: 'tr-TR',
  });
  assert.equal(backup.defaultLocale, 'tr-TR');
});

test('readback selects staged release even when completed history is first', async () => {
  const client = fakeClient();
  client.getTrack = async (_editId, track) => ({
    track,
    releases: track === 'production'
      ? [
          { status: 'completed', versionCodes: ['1102'] },
          { status: 'inProgress', userFraction: 0.1, versionCodes: ['1103'] },
        ]
      : [],
  });
  const errors = await verifyLiveState(client, {
    locales: ['en-US', 'tr-TR'],
    productionRolloutFraction: 0.1,
    subscriptions: [
      { productId: 'premium_monthly', basePlanId: 'monthly' },
      { productId: 'premium_weekly', basePlanId: 'weekly' },
    ],
  });
  assert.deepEqual(errors, []);
});


test('backup CLI rejects an outside symlink that resolves inside the repository', async (t) => {
  if (process.platform === 'win32') return;
  const fs = await import('node:fs');
  const { assertSafeOutputPath } = await import('./backup-play-metadata.mjs');
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'play-backup-repo-'));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'play-backup-outside-'));
  t.after(() => {
    fs.rmSync(repositoryRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  });
  const privateDir = path.join(repositoryRoot, 'private');
  fs.mkdirSync(privateDir, { recursive: true });
  const linkDir = path.join(outsideRoot, 'linked');
  fs.symlinkSync(privateDir, linkDir, 'dir');
  assert.throws(
    () => assertSafeOutputPath(path.join(linkDir, 'backup.json'), repositoryRoot),
    /outside the repository/i,
  );
});
