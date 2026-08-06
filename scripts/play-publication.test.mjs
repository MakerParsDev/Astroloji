import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertFreshBackup,
  backupConfirmation,
  publishPreparedMetadata,
  restoreConfirmation,
  restorePreparedMetadata,
} from './lib/play-publication.mjs';

function writeFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return {
    filePath,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
  };
}

function proposedFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'play-publication-assets-'));
  const makeImages = (locale) => ({
    icon: locale === 'tr-TR'
      ? [writeFile(root, `${locale}/icon.png`, Buffer.from('icon'))]
      : [],
    featureGraphic: [
      writeFile(root, `${locale}/feature.png`, Buffer.from(`feature-${locale}`)),
    ],
    phoneScreenshots: Array.from({ length: 6 }, (_, index) =>
      writeFile(root, `${locale}/phone-${index + 1}.png`, Buffer.from(`${locale}-${index + 1}`)),
    ),
  });
  return {
    packageName: 'com.parsfilo.astrology',
    defaultLocale: 'tr-TR',
    locales: ['en-US', 'tr-TR'],
    listings: {
      'en-US': {
        title: 'Astrology: Daily Horoscope',
        shortDescription: 'Daily horoscope.',
        fullDescription: 'English full.',
        images: makeImages('en-US'),
      },
      'tr-TR': {
        title: 'Astroloji: Günlük Burç',
        shortDescription: 'Günlük burç.',
        fullDescription: 'Türkçe tam.',
        images: makeImages('tr-TR'),
      },
    },
    productionRolloutFraction: 0.1,
    subscriptions: [
      { productId: 'premium_monthly', basePlanId: 'monthly' },
      { productId: 'premium_weekly', basePlanId: 'weekly' },
    ],
  };
}

function backedUpImage(url) {
  const bytes = Buffer.from(`downloaded:${url}`);
  return {
    url,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}

function backupFixture(capturedAt = '2026-08-06T15:00:00.000Z') {
  return {
    schemaVersion: 1,
    capturedAt,
    packageName: 'com.parsfilo.astrology',
    listings: [
      {
        locale: 'en-US',
        title: 'Old English',
        shortDescription: 'Old',
        fullDescription: 'Old',
        images: { icon: [], featureGraphic: [], phoneScreenshots: [] },
      },
      {
        locale: 'tr-TR',
        title: 'Eski Türkçe',
        shortDescription: 'Eski',
        fullDescription: 'Eski',
        images: {
          icon: [backedUpImage('https://backup.invalid/tr-icon.png')],
          featureGraphic: [backedUpImage('https://backup.invalid/tr-feature.png')],
          phoneScreenshots: [backedUpImage('https://backup.invalid/tr-phone.png')],
        },
      },
    ],
    tracks: {
      production: {
        track: 'production',
        releases: [{ status: 'inProgress', userFraction: 0.1, versionCodes: ['1102'] }],
      },
      internal: { track: 'internal', releases: [{ status: 'completed', versionCodes: ['1101'] }] },
    },
    subscriptions: [
      { productId: 'premium_monthly', basePlans: [{ basePlanId: 'monthly', state: 'ACTIVE' }] },
      { productId: 'premium_weekly', basePlans: [{ basePlanId: 'weekly', state: 'ACTIVE' }] },
    ],
  };
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fakeClient({ failUploadAt = null } = {}) {
  const calls = [];
  const imageState = new Map();
  let uploadCount = 0;
  const key = (locale, imageType) => `${locale}/${imageType}`;
  return {
    calls,
    packageName: 'com.parsfilo.astrology',
    async createEdit() {
      calls.push(['createEdit']);
      return { id: 'edit-publish' };
    },
    async updateListing(editId, locale, listing) {
      calls.push(['updateListing', editId, locale, listing]);
      return listing;
    },
    async getListing(_editId, locale) {
      const call = [...calls].reverse().find((entry) => entry[0] === 'updateListing' && entry[2] === locale);
      return call?.[3] ?? {};
    },
    async deleteAllImages(editId, locale, imageType) {
      calls.push(['deleteAllImages', editId, locale, imageType]);
      imageState.set(key(locale, imageType), []);
      return { deleted: [] };
    },
    async uploadImage(editId, locale, imageType, filePath) {
      uploadCount += 1;
      calls.push(['uploadImage', editId, locale, imageType, path.basename(filePath)]);
      if (uploadCount === failUploadAt) throw new Error('simulated image upload failure');
      const image = {
        id: `image-${uploadCount}`,
        sha256: crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
      };
      imageState.set(key(locale, imageType), [...(imageState.get(key(locale, imageType)) ?? []), image]);
      return image;
    },
    async listImages(_editId, locale, imageType) {
      return imageState.get(key(locale, imageType)) ?? [];
    },
    async commitEdit(editId) {
      calls.push(['commitEdit', editId]);
      return { id: editId };
    },
    async deleteEdit(editId) {
      calls.push(['deleteEdit', editId]);
      return {};
    },
  };
}

test('backup confirmation is digest-bound and stale backups are rejected', () => {
  const backup = backupFixture();
  const backupDigest = digest(backup);
  assert.equal(backupConfirmation(backupDigest), `PUBLISH_TR_EN_METADATA_${backupDigest.slice(0, 12)}`);
  assert.equal(restoreConfirmation(backupDigest), `RESTORE_PLAY_METADATA_${backupDigest.slice(0, 12)}`);
  assert.doesNotThrow(() =>
    assertFreshBackup(backup, {
      now: new Date('2026-08-06T15:20:00.000Z'),
      maxAgeMinutes: 30,
    }),
  );
  assert.throws(
    () =>
      assertFreshBackup(backup, {
        now: new Date('2026-08-06T16:00:01.000Z'),
        maxAgeMinutes: 30,
      }),
    /backup is stale/i,
  );
});

test('partial image upload abandons the edit and never commits', async () => {
  const proposed = proposedFixture();
  const backup = backupFixture();
  const backupDigest = digest(backup);
  const client = fakeClient({ failUploadAt: 2 });
  await assert.rejects(
    publishPreparedMetadata({
      client,
      backup,
      backupDigest,
      confirmation: backupConfirmation(backupDigest),
      proposed,
      now: new Date('2026-08-06T15:10:00.000Z'),
      maxAgeMinutes: 30,
      independentReadback: async () => [],
    }),
    /simulated image upload failure/,
  );
  assert.ok(client.calls.some((call) => call[0] === 'deleteEdit'));
  assert.ok(!client.calls.some((call) => call[0] === 'commitEdit'));
});

test('successful publication replaces supported images, commits, then performs independent readback', async () => {
  const proposed = proposedFixture();
  const backup = backupFixture();
  const backupDigest = digest(backup);
  const client = fakeClient();
  let readbackCalls = 0;
  const result = await publishPreparedMetadata({
    client,
    backup,
    backupDigest,
    confirmation: backupConfirmation(backupDigest),
    proposed,
    now: new Date('2026-08-06T15:10:00.000Z'),
    maxAgeMinutes: 30,
    independentReadback: async () => {
      readbackCalls += 1;
      return [];
    },
  });
  assert.equal(result.editId, 'edit-publish');
  assert.equal(readbackCalls, 1);
  assert.ok(client.calls.some((call) => call[0] === 'commitEdit'));
  assert.ok(!client.calls.some((call) => call[0] === 'deleteEdit'));
  assert.ok(!client.calls.some((call) => call[0] === 'deleteListing'));
  assert.equal(client.calls.filter((call) => call[0] === 'uploadImage').length, 15);
});

test('restore reconstructs listing text and backed-up images in a new edit', async () => {
  const backup = backupFixture();
  const backupDigest = digest(backup);
  const client = fakeClient();
  const fetched = [];
  const fetchImpl = async (url) => {
    fetched.push(String(url));
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      async arrayBuffer() {
        return Uint8Array.from(Buffer.from(`downloaded:${url}`)).buffer;
      },
    };
  };
  await restorePreparedMetadata({
    client,
    backup,
    backupDigest,
    confirmation: restoreConfirmation(backupDigest),
    fetchImpl,
  });
  assert.equal(fetched.length, 3);
  assert.ok(client.calls.some((call) => call[0] === 'commitEdit'));
  assert.ok(client.calls.some((call) => call[0] === 'updateListing' && call[2] === 'tr-TR'));
  assert.equal(client.calls.filter((call) => call[0] === 'uploadImage').length, 3);
});

test('publisher CLI integration refuses missing digest-bound confirmation before creating an edit', async () => {
  const { publishPlayMetadata } = await import('./publish-play-metadata.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'play-publisher-cli-'));
  const backupPath = path.join(directory, 'backup.json');
  fs.writeFileSync(backupPath, `${JSON.stringify(backupFixture(), null, 2)}\n`);
  const client = fakeClient();
  await assert.rejects(
    publishPlayMetadata({
      repositoryRoot: process.cwd(),
      backupPath,
      confirmation: '',
      client,
      now: new Date('2026-08-06T15:10:00.000Z'),
    }),
    /Missing publication confirmation/,
  );
  assert.equal(client.calls.length, 0);
});

test('restore CLI integration stays dry-run without confirmation', async () => {
  const { runRestoreCli } = await import('./restore-play-metadata.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'play-restore-cli-'));
  const backupPath = path.join(directory, 'backup.json');
  fs.writeFileSync(backupPath, `${JSON.stringify(backupFixture(), null, 2)}\n`);
  const result = await runRestoreCli({ backupPath, confirmation: '' });
  assert.equal(result.dryRun, true);
  assert.match(result.expectedConfirmation, /^RESTORE_PLAY_METADATA_[0-9a-f]{12}$/);
});

test('diff CLI writes a mode-0600 JSON report beside the backup', async () => {
  const { runDiffCli } = await import('./diff-play-metadata.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'play-diff-cli-'));
  const backupPath = path.join(directory, 'backup.json');
  fs.writeFileSync(backupPath, `${JSON.stringify(backupFixture(), null, 2)}\n`);
  const result = runDiffCli({ backupPath, expectedRoot: process.cwd() });
  assert.equal(result.diff.blockingErrors.length, 0);
  assert.ok(fs.existsSync(result.outputPath));
  assert.equal(fs.statSync(result.outputPath).mode & 0o777, 0o600);
  const report = JSON.parse(fs.readFileSync(result.outputPath, 'utf8'));
  assert.equal(report.backupSha256, result.backupDigest);
});
