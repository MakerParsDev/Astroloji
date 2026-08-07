import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPlayDiff, formatPlayDiff } from './lib/play-diff.mjs';

function liveFixture({ rollout = 0.1 } = {}) {
  return {
    schemaVersion: 1,
    capturedAt: '2026-08-06T15:00:00.000Z',
    packageName: 'com.parsfilo.astrology',
    listings: [
      {
        locale: 'de-DE',
        title: 'Astrologie',
        shortDescription: 'Alt',
        fullDescription: 'Alt',
        images: { icon: [], featureGraphic: [], phoneScreenshots: [] },
      },
      {
        locale: 'en-US',
        title: 'Old English',
        shortDescription: 'Old short',
        fullDescription: 'Old full',
        images: {
          icon: [],
          featureGraphic: [{ sha256: 'old-feature-en' }],
          phoneScreenshots: [{ sha256: 'old-phone-1' }, { sha256: 'old-phone-2' }, { sha256: 'old-phone-3' }],
        },
      },
      {
        locale: 'tr-TR',
        title: 'Eski Türkçe',
        shortDescription: 'Eski kısa',
        fullDescription: 'Eski tam',
        images: {
          icon: [{ sha256: 'old-icon' }],
          featureGraphic: [{ sha256: 'old-feature-tr' }],
          phoneScreenshots: [{ sha256: 'old-phone-tr-1' }, { sha256: 'old-phone-tr-2' }, { sha256: 'old-phone-tr-3' }],
        },
      },
    ],
    tracks: {
      production: {
        track: 'production',
        releases: [{ status: 'inProgress', userFraction: rollout, versionCodes: ['1102'] }],
      },
      internal: { track: 'internal', releases: [{ status: 'completed', versionCodes: ['1101'] }] },
    },
    subscriptions: [
      { productId: 'premium_monthly', basePlans: [{ basePlanId: 'monthly', state: 'ACTIVE' }] },
      { productId: 'premium_weekly', basePlans: [{ basePlanId: 'weekly', state: 'ACTIVE' }] },
    ],
  };
}

function proposedFixture() {
  return {
    packageName: 'com.parsfilo.astrology',
    defaultLocale: 'tr-TR',
    locales: ['en-US', 'tr-TR'],
    listings: {
      'en-US': {
        title: 'Astrology: Daily Horoscope',
        shortDescription: 'Daily horoscopes and compatibility.',
        fullDescription: 'New English full description.',
        images: {
          icon: [],
          featureGraphic: [{ sha256: 'new-feature-en' }],
          phoneScreenshots: Array.from({ length: 6 }, (_, index) => ({ sha256: `new-en-${index + 1}` })),
        },
      },
      'tr-TR': {
        title: 'Astroloji: Günlük Burç',
        shortDescription: 'Günlük burç yorumları ve uyum.',
        fullDescription: 'Yeni Türkçe tam açıklama.',
        images: {
          icon: [{ sha256: 'new-icon' }],
          featureGraphic: [{ sha256: 'new-feature-tr' }],
          phoneScreenshots: Array.from({ length: 6 }, (_, index) => ({ sha256: `new-tr-${index + 1}` })),
        },
      },
    },
    productionRolloutFraction: 0.1,
    subscriptions: [
      { productId: 'premium_monthly', basePlanId: 'monthly' },
      { productId: 'premium_weekly', basePlanId: 'weekly' },
    ],
  };
}

test('diff reports supported listing changes, image replacement, and preserved extra locales', () => {
  const diff = buildPlayDiff(liveFixture(), proposedFixture());
  assert.equal(diff.blockingErrors.length, 0);
  assert.deepEqual(diff.extraLiveLocales, ['de-DE']);
  assert.equal(diff.listings['tr-TR'].title, 'CHANGED');
  assert.equal(diff.listings['en-US'].fullDescription, 'CHANGED');
  assert.deepEqual(diff.images['tr-TR'].phoneScreenshots, { before: 3, after: 6, status: 'CHANGED' });

  const formatted = formatPlayDiff(diff);
  assert.match(formatted, /LISTING tr-TR title: CHANGED/);
  assert.match(formatted, /LISTING en-US fullDescription: CHANGED/);
  assert.match(formatted, /IMAGE tr-TR phoneScreenshots: 3 -> 6/);
  assert.match(formatted, /EXTRA LIVE LOCALES: PRESERVED 1 de-DE/);
  assert.match(formatted, /TRACK production rolloutFraction: UNCHANGED 0\.1/);
  assert.match(
    formatted,
    /SUBSCRIPTIONS: UNCHANGED premium_monthly\/monthly, premium_weekly\/weekly/,
  );
});

test('diff blocks rollout and subscription drift without proposing track or catalog mutation', () => {
  const live = liveFixture({ rollout: 1 });
  live.subscriptions = [
    { productId: 'premium_monthly', basePlans: [{ basePlanId: 'monthly', state: 'ACTIVE' }] },
    { productId: 'premium_yearly', basePlans: [{ basePlanId: 'yearly', state: 'ACTIVE' }] },
  ];
  const diff = buildPlayDiff(live, proposedFixture());
  assert.ok(diff.blockingErrors.some((error) => /rollout/i.test(error)));
  assert.ok(diff.blockingErrors.some((error) => /subscription/i.test(error)));
  const formatted = formatPlayDiff(diff);
  assert.match(formatted, /TRACK production rolloutFraction: DRIFT live=1 expected=0\.1/);
  assert.match(formatted, /SUBSCRIPTIONS: DRIFT/);
  assert.doesNotMatch(formatted, /UPDATE TRACK|DELETE SUBSCRIPTION/);
});

test('diff is stable regardless of live listing order', () => {
  const first = liveFixture();
  const second = liveFixture();
  second.listings.reverse();
  assert.deepEqual(buildPlayDiff(first, proposedFixture()), buildPlayDiff(second, proposedFixture()));
});

test('canonical loader maps shared icon and singular manifest roles to Play image slots', async () => {
  const { loadCanonicalPlayState } = await import('./lib/play-diff.mjs');
  const proposed = loadCanonicalPlayState(process.cwd());
  assert.equal(proposed.defaultLocale, 'tr-TR');
  assert.equal(proposed.listings['tr-TR'].images.icon.length, 1);
  assert.equal(proposed.listings['en-US'].images.icon.length, 0);
  assert.equal(proposed.listings['en-US'].images.featureGraphic.length, 1);
  assert.equal(proposed.listings['tr-TR'].images.featureGraphic.length, 1);
  assert.equal(proposed.listings['en-US'].images.phoneScreenshots.length, 6);
  assert.equal(proposed.listings['tr-TR'].images.phoneScreenshots.length, 6);
});

test('live state digest ignores capture time and listing order but changes with content', async () => {
  const { computePlayStateDigest } = await import('./lib/play-diff.mjs');
  const first = liveFixture();
  const second = structuredClone(first);
  second.capturedAt = '2030-01-01T00:00:00.000Z';
  second.listings.reverse();
  assert.equal(computePlayStateDigest(first), computePlayStateDigest(second));
  second.listings[0].title = 'Changed title';
  assert.notEqual(computePlayStateDigest(first), computePlayStateDigest(second));
});

test('image diff detects equal-count content changes when live backup exposes sha1/id only', () => {
  const live = liveFixture();
  live.listings.find((listing) => listing.locale === 'tr-TR').images.phoneScreenshots = [
    { id: 'live-old', sha1: 'old-sha1', sha256: null },
  ];
  const proposed = proposedFixture();
  proposed.listings['tr-TR'].images.phoneScreenshots = [
    { sha256: 'a'.repeat(64) },
  ];
  const diff = buildPlayDiff(live, proposed);
  assert.equal(diff.images['tr-TR'].phoneScreenshots.status, 'CHANGED');
});
