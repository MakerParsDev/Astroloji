import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertBackupMatchesLiveState,
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
    productionRolloutFraction: 1,
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
    defaultLocale: 'tr-TR',
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
        releases: [{ status: 'completed', versionCodes: ['1102'] }],
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
    independentReadback: async () => [],
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
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(result.outputPath).mode & 0o777, 0o600);
  }
  const report = JSON.parse(fs.readFileSync(result.outputPath, 'utf8'));
  assert.equal(report.backupSha256, result.backupDigest);
});

test('publication rejects missing package identity before creating an edit', async () => {
  const proposed = proposedFixture();
  const backup = backupFixture();
  const backupDigest = digest(backup);
  const client = fakeClient();
  client.packageName = '';
  await assert.rejects(
    publishPreparedMetadata({
      client,
      backup,
      backupDigest,
      confirmation: backupConfirmation(backupDigest),
      proposed,
      now: new Date('2026-08-06T15:10:00.000Z'),
      independentReadback: async () => [],
    }),
    /missing package/i,
  );
  assert.equal(client.calls.length, 0);
});

test('post-commit readback failure names the committed edit and restoration action', async () => {
  const proposed = proposedFixture();
  const backup = backupFixture();
  const backupDigest = digest(backup);
  const client = fakeClient();
  await assert.rejects(
    publishPreparedMetadata({
      client,
      backup,
      backupDigest,
      confirmation: backupConfirmation(backupDigest),
      proposed,
      now: new Date('2026-08-06T15:10:00.000Z'),
      independentReadback: async () => ['listing drift'],
    }),
    /committed edit edit-publish.*restore/i,
  );
  assert.ok(client.calls.some((call) => call[0] === 'commitEdit'));
});

test('restore rejects backups that omit explicit default locale or valid image sha256 before edit creation', async () => {
  const backup = backupFixture();
  delete backup.defaultLocale;
  const backupDigest = digest(backup);
  const client = fakeClient();
  await assert.rejects(
    restorePreparedMetadata({ client, backup, backupDigest, confirmation: restoreConfirmation(backupDigest) }),
    /defaultLocale/i,
  );
  assert.equal(client.calls.length, 0);

  backup.defaultLocale = 'tr-TR';
  backup.listings[1].images.icon[0].sha256 = null;
  const digestWithDefault = digest(backup);
  await assert.rejects(
    restorePreparedMetadata({
      client,
      backup,
      backupDigest: digestWithDefault,
      confirmation: restoreConfirmation(digestWithDefault),
    }),
    /valid sha-256/i,
  );
  assert.equal(client.calls.length, 0);
});

test('publication preflight rejects missing or malformed proposed image sha256 values', async () => {
  const proposed = proposedFixture();
  const backup = backupFixture();
  const backupDigest = digest(backup);
  const client = fakeClient();
  const originalUpload = client.uploadImage;
  client.uploadImage = async (...args) => {
    const image = await originalUpload(...args);
    return { ...image, sha256: '' };
  };
  // listImages state is populated inside the fake client, so corrupt one proposed expected hash instead.
  proposed.listings['en-US'].images.featureGraphic[0].sha256 = '';
  await assert.rejects(
    publishPreparedMetadata({
      client,
      backup,
      backupDigest,
      confirmation: backupConfirmation(backupDigest),
      proposed,
      now: new Date('2026-08-06T15:10:00.000Z'),
      independentReadback: async () => [],
    }),
    /valid sha-256/i,
  );
});



test('edit-local verification rejects malformed uploaded image sha256 and abandons the edit', async () => {
  const proposed = proposedFixture();
  const backup = backupFixture();
  const backupDigest = digest(backup);
  const client = fakeClient();
  const originalListImages = client.listImages;
  client.listImages = async (...args) => {
    const images = await originalListImages(...args);
    if (images.length > 0) return [{ ...images[0], sha256: '' }, ...images.slice(1)];
    return images;
  };
  await assert.rejects(
    publishPreparedMetadata({
      client,
      backup,
      backupDigest,
      confirmation: backupConfirmation(backupDigest),
      proposed,
      now: new Date('2026-08-06T15:10:00.000Z'),
      independentReadback: async () => [],
    }),
    /valid sha-256|image checksum/i,
  );
  assert.ok(client.calls.some((call) => call[0] === 'deleteEdit'));
  assert.ok(!client.calls.some((call) => call[0] === 'commitEdit'));
});

test('release-note mutation filters supported locales and targets selected staged release', async () => {
  const { releaseNotesMutation } = await import('./publish-play-metadata.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'play-release-notes-'));
  for (const [locale, text] of [['en-US', 'English note'], ['tr-TR', 'Türkçe not'], ['de-DE', 'Nicht erlaubt']]) {
    fs.mkdirSync(path.join(root, locale), { recursive: true });
    fs.writeFileSync(path.join(root, locale, 'default.txt'), text);
  }
  let updated;
  const client = {
    async getTrack() {
      return {
        track: 'production',
        releases: [
          { status: 'completed', versionCodes: ['1102'], releaseNotes: [{ language: 'en-US', text: 'old' }] },
          { status: 'inProgress', userFraction: 0.1, versionCodes: ['1103'] },
        ],
      };
    },
    async updateTrack(_editId, _track, value) { updated = value; },
  };
  const mutate = releaseNotesMutation(root, 'production', ['en-US', 'tr-TR']);
  await mutate(client, 'edit');
  assert.deepEqual(updated.releases[0].releaseNotes, [{ language: 'en-US', text: 'old' }]);
  assert.deepEqual(updated.releases[1].releaseNotes, [
    { language: 'en-US', text: 'English note' },
    { language: 'tr-TR', text: 'Türkçe not' },
  ]);
  assert.doesNotMatch(JSON.stringify(updated), /de-DE|Nicht erlaubt/);
});

test('restore CLI refuses legacy backup before presenting an actionable confirmation', async () => {
  const { runRestoreCli } = await import('./restore-play-metadata.mjs');
  const backup = backupFixture();
  delete backup.defaultLocale;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-play-backup-'));
  const backupPath = path.join(dir, 'backup.json');
  fs.writeFileSync(backupPath, JSON.stringify(backup));
  await assert.rejects(runRestoreCli({ backupPath }), /defaultLocale/i);
});


test('restore requires independent read-back before creating an edit', async () => {
  const backup = backupFixture();
  const backupDigest = digest(backup);
  const client = fakeClient();
  await assert.rejects(
    restorePreparedMetadata({
      client,
      backup,
      backupDigest,
      confirmation: restoreConfirmation(backupDigest),
      fetchImpl: async () => ({ ok: true, async arrayBuffer() { return new ArrayBuffer(0); } }),
    }),
    /requires an independent read-back/i,
  );
  assert.equal(client.calls.length, 0);
});

test('restore applies a bounded timeout to backup image downloads', async (t) => {
  const backup = backupFixture();
  const backupDigest = digest(backup);
  const client = fakeClient();
  const signals = [];
  const timeoutValues = [];
  const originalTimeout = AbortSignal.timeout;
  AbortSignal.timeout = (value) => {
    timeoutValues.push(value);
    return originalTimeout(value);
  };
  t.after(() => { AbortSignal.timeout = originalTimeout; });
  const fetchImpl = async (url, options = {}) => {
    signals.push(options.signal);
    return {
      ok: true,
      status: 200,
      async arrayBuffer() { return Uint8Array.from(Buffer.from(`downloaded:${url}`)).buffer; },
    };
  };
  await restorePreparedMetadata({
    client,
    backup,
    backupDigest,
    confirmation: restoreConfirmation(backupDigest),
    fetchImpl,
    imageDownloadTimeoutMs: 1234,
    independentReadback: async () => [],
  });
  assert.equal(signals.length, 3);
  assert.ok(signals.every((signal) => signal instanceof AbortSignal));
  assert.deepEqual(timeoutValues, [1234, 1234, 1234]);
});

test('edit abandonment failure does not mask the original publication error', async () => {
  const proposed = proposedFixture();
  const backup = backupFixture();
  const backupDigest = digest(backup);
  const client = fakeClient({ failUploadAt: 2 });
  client.deleteEdit = async () => { throw new Error('cleanup failure'); };
  await assert.rejects(
    publishPreparedMetadata({
      client,
      backup,
      backupDigest,
      confirmation: backupConfirmation(backupDigest),
      proposed,
      now: new Date('2026-08-06T15:10:00.000Z'),
      independentReadback: async () => [],
    }),
    /simulated image upload failure/,
  );
});


test('approved backup state digest must match fresh live state', () => {
  const backup = backupFixture();
  const current = structuredClone(backup);
  current.capturedAt = '2026-08-06T15:05:00.000Z';
  assert.doesNotThrow(() => assertBackupMatchesLiveState(backup, current));
  current.listings[0].title = 'Concurrent Play Console change';
  assert.throws(
    () => assertBackupMatchesLiveState(backup, current),
    /live Play state changed since the approved backup/i,
  );
});

test('publisher CLI rejects fresh live-state drift before opening a mutation edit', async () => {
  const { publishPlayMetadata } = await import('./publish-play-metadata.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'play-publisher-live-guard-'));
  const backup = backupFixture();
  const backupPath = path.join(directory, 'backup.json');
  fs.writeFileSync(backupPath, `${JSON.stringify(backup, null, 2)}
`);
  const client = fakeClient();
  const current = structuredClone(backup);
  current.listings[0].shortDescription = 'Concurrent change';
  await assert.rejects(
    publishPlayMetadata({
      repositoryRoot: process.cwd(),
      backupPath,
      confirmation: backupConfirmation(crypto.createHash('sha256').update(fs.readFileSync(backupPath)).digest('hex')),
      client,
      captureCurrentState: async () => current,
      now: new Date('2026-08-06T15:10:00.000Z'),
    }),
    /live Play state changed since the approved backup/i,
  );
  assert.equal(client.calls.length, 0);
});


test('release-note mutation logs why publication is skipped', async () => {
  const { releaseNotesMutation } = await import('./publish-play-metadata.mjs');
  const logs = [];
  const missingTrack = releaseNotesMutation('/does/not/matter', '', ['en-US', 'tr-TR'], (message) => logs.push(message));
  await missingTrack({}, 'edit');
  assert.match(logs.shift(), /PLAY_METADATA_TRACK.*not set/i);
  const missingRoot = releaseNotesMutation('/definitely/missing/release-notes', 'production', ['en-US'], (message) => logs.push(message));
  await missingRoot({}, 'edit');
  assert.match(logs.shift(), /release-note.*does not exist/i);
});

test('publisher uses only the canonical metadata root and exposes no environment override', async () => {
  const source = fs.readFileSync('scripts/publish-play-metadata.mjs', 'utf8');
  assert.doesNotMatch(source, /PLAY_METADATA_ROOT/);
  assert.match(source, /path\.join\(resolvedRepositoryRoot, 'Astroloji', 'play'\)/);
});
