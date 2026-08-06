import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadStoreConfig } from './play-store-config.mjs';

const LISTING_FIELDS = ['title', 'shortDescription', 'fullDescription'];
const IMAGE_TYPES = ['icon', 'featureGraphic', 'phoneScreenshots'];

function normalizeText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function releaseRolloutFraction(track) {
  const release = track?.releases?.[0];
  if (!release) return null;
  if (release.userFraction !== null && release.userFraction !== undefined) {
    return Number(release.userFraction);
  }
  return release.status === 'completed' ? 1 : null;
}

function subscriptionPairsFromLive(subscriptions) {
  return subscriptions
    .flatMap((subscription) =>
      (subscription.basePlans ?? []).map(
        (basePlan) => `${subscription.productId}/${basePlan.basePlanId}`,
      ),
    )
    .sort();
}

function subscriptionPairsFromProposed(subscriptions) {
  return subscriptions
    .map((subscription) => `${subscription.productId}/${subscription.basePlanId}`)
    .sort();
}

function imageHashes(images) {
  return [...(images ?? [])]
    .map((image) => String(image.sha256 ?? ''))
    .sort();
}

function imageDiff(beforeImages, afterImages) {
  const before = beforeImages?.length ?? 0;
  const after = afterImages?.length ?? 0;
  const status =
    before === after &&
    JSON.stringify(imageHashes(beforeImages)) === JSON.stringify(imageHashes(afterImages))
      ? 'UNCHANGED'
      : 'CHANGED';
  return { before, after, status };
}


export function computePlayStateDigest(state) {
  const listings = [...(state.listings ?? [])]
    .map((listing) => ({
      locale: listing.locale,
      title: normalizeText(listing.title),
      shortDescription: normalizeText(listing.shortDescription),
      fullDescription: normalizeText(listing.fullDescription),
      video: listing.video ?? null,
      images: Object.fromEntries(
        IMAGE_TYPES.map((imageType) => [
          imageType,
          [...(listing.images?.[imageType] ?? [])]
            .map((image) => String(image.sha256 ?? image.sha1 ?? image.id ?? ''))
            .sort(),
        ]),
      ),
    }))
    .sort((a, b) => a.locale.localeCompare(b.locale));

  const tracks = Object.fromEntries(
    Object.entries(state.tracks ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([trackName, track]) => [
        trackName,
        [...(track.releases ?? [])]
          .map((release) => ({
            name: release.name ?? null,
            status: release.status ?? null,
            userFraction: release.userFraction ?? null,
            versionCodes: [...(release.versionCodes ?? [])].map(String).sort(),
            releaseNotes: [...(release.releaseNotes ?? [])]
              .map((note) => ({
                language: note.language,
                text: normalizeText(note.text),
              }))
              .sort((a, b) => a.language.localeCompare(b.language)),
          }))
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      ]),
  );

  const subscriptions = subscriptionPairsFromLive(state.subscriptions ?? []);
  const canonical = {
    packageName: state.packageName,
    listings,
    tracks,
    subscriptions,
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function buildPlayDiff(live, proposed) {
  const liveByLocale = new Map(
    [...(live.listings ?? [])]
      .sort((a, b) => a.locale.localeCompare(b.locale))
      .map((listing) => [listing.locale, listing]),
  );
  const supportedLocales = [...proposed.locales].sort();
  const listings = {};
  const images = {};

  for (const locale of supportedLocales) {
    const before = liveByLocale.get(locale);
    const after = proposed.listings[locale];
    listings[locale] = {};
    images[locale] = {};
    for (const field of LISTING_FIELDS) {
      listings[locale][field] = before
        ? normalizeText(before[field]) === normalizeText(after[field])
          ? 'UNCHANGED'
          : 'CHANGED'
        : 'ADDED';
    }
    for (const imageType of IMAGE_TYPES) {
      images[locale][imageType] = imageDiff(
        before?.images?.[imageType] ?? [],
        after.images?.[imageType] ?? [],
      );
    }
  }

  const extraLiveLocales = [...liveByLocale.keys()]
    .filter((locale) => !supportedLocales.includes(locale))
    .sort();
  const missingLiveLocales = supportedLocales
    .filter((locale) => !liveByLocale.has(locale))
    .sort();

  const liveRolloutFraction = releaseRolloutFraction(live.tracks?.production);
  const expectedRolloutFraction = proposed.productionRolloutFraction;
  const rolloutStatus = liveRolloutFraction === expectedRolloutFraction ? 'UNCHANGED' : 'DRIFT';

  const liveSubscriptions = subscriptionPairsFromLive(live.subscriptions ?? []);
  const expectedSubscriptions = subscriptionPairsFromProposed(proposed.subscriptions ?? []);
  const subscriptionsStatus =
    JSON.stringify(liveSubscriptions) === JSON.stringify(expectedSubscriptions)
      ? 'UNCHANGED'
      : 'DRIFT';

  const blockingErrors = [];
  if (rolloutStatus === 'DRIFT') {
    blockingErrors.push(
      `Production rollout drift: live=${String(liveRolloutFraction)} expected=${expectedRolloutFraction}`,
    );
  }
  if (subscriptionsStatus === 'DRIFT') {
    blockingErrors.push(
      `Subscription catalog drift: live=${liveSubscriptions.join(',') || 'none'} ` +
        `expected=${expectedSubscriptions.join(',') || 'none'}`,
    );
  }

  return {
    schemaVersion: 1,
    packageName: proposed.packageName,
    supportedLocales,
    extraLiveLocales,
    missingLiveLocales,
    listings,
    images,
    productionTrack: {
      status: rolloutStatus,
      liveRolloutFraction,
      expectedRolloutFraction,
    },
    subscriptions: {
      status: subscriptionsStatus,
      live: liveSubscriptions,
      expected: expectedSubscriptions,
    },
    blockingErrors,
  };
}

export function formatPlayDiff(diff) {
  const lines = [];
  for (const locale of diff.supportedLocales) {
    for (const field of LISTING_FIELDS) {
      lines.push(`LISTING ${locale} ${field}: ${diff.listings[locale][field]}`);
    }
    for (const imageType of IMAGE_TYPES) {
      const image = diff.images[locale][imageType];
      lines.push(`IMAGE ${locale} ${imageType}: ${image.before} -> ${image.after}`);
    }
  }

  lines.push(
    diff.extraLiveLocales.length > 0
      ? `EXTRA LIVE LOCALES: PRESERVED ${diff.extraLiveLocales.length} ${diff.extraLiveLocales.join(', ')}`
      : 'EXTRA LIVE LOCALES: NONE',
  );
  lines.push(
    diff.missingLiveLocales.length > 0
      ? `MISSING SUPPORTED LIVE LOCALES: ${diff.missingLiveLocales.join(', ')}`
      : 'MISSING SUPPORTED LIVE LOCALES: NONE',
  );

  if (diff.productionTrack.status === 'UNCHANGED') {
    lines.push(
      `TRACK production rolloutFraction: UNCHANGED ${diff.productionTrack.expectedRolloutFraction}`,
    );
  } else {
    lines.push(
      `TRACK production rolloutFraction: DRIFT live=${String(diff.productionTrack.liveRolloutFraction)} ` +
        `expected=${diff.productionTrack.expectedRolloutFraction}`,
    );
  }

  if (diff.subscriptions.status === 'UNCHANGED') {
    lines.push(`SUBSCRIPTIONS: UNCHANGED ${diff.subscriptions.expected.join(', ')}`);
  } else {
    lines.push(
      `SUBSCRIPTIONS: DRIFT live=${diff.subscriptions.live.join(', ') || 'none'} ` +
        `expected=${diff.subscriptions.expected.join(', ') || 'none'}`,
    );
  }

  for (const error of diff.blockingErrors) lines.push(`BLOCKER: ${error}`);
  return `${lines.join('\n')}\n`;
}

function readTrimmed(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').trim();
}

export function loadCanonicalPlayState(rootDir) {
  const repositoryRoot = path.resolve(rootDir);
  const config = loadStoreConfig(repositoryRoot);
  if (!config.defaultLocale || !config.locales.includes(config.defaultLocale)) {
    throw new Error('store-config.json must define defaultLocale within locales.');
  }

  const manifest = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, 'Astroloji/play/asset-manifest.json'), 'utf8'),
  );
  const assetsRoot = path.join(repositoryRoot, 'Astroloji/play/assets');
  const listingsRoot = path.join(repositoryRoot, 'Astroloji/play/listings');
  const listings = {};

  for (const locale of [...config.locales].sort()) {
    const localeRoot = path.join(listingsRoot, locale);
    listings[locale] = {
      title: readTrimmed(path.join(localeRoot, 'title.txt')),
      shortDescription: readTrimmed(path.join(localeRoot, 'short-description.txt')),
      fullDescription: readTrimmed(path.join(localeRoot, 'full-description.txt')),
      images: { icon: [], featureGraphic: [], phoneScreenshots: [] },
    };
  }

  const manifestRoleToPlayImageType = {
    icon: 'icon',
    featureGraphic: 'featureGraphic',
    phoneScreenshot: 'phoneScreenshots',
  };
  for (const asset of manifest.assets ?? []) {
    const targetLocale = asset.locale === 'shared' ? config.defaultLocale : asset.locale;
    if (!listings[targetLocale]) {
      throw new Error(`Asset ${asset.path} targets unsupported locale ${targetLocale}.`);
    }
    const imageType = manifestRoleToPlayImageType[asset.role];
    if (!imageType) {
      throw new Error(`Asset ${asset.path} has unsupported manifest role ${asset.role}.`);
    }
    listings[targetLocale].images[imageType].push({
      filePath: path.join(assetsRoot, asset.path),
      sha256: asset.sha256,
      order: asset.order,
    });
  }

  for (const locale of config.locales) {
    for (const imageType of IMAGE_TYPES) {
      listings[locale].images[imageType].sort((a, b) => a.order - b.order);
    }
  }

  return {
    packageName: config.packageName,
    defaultLocale: config.defaultLocale,
    locales: [...config.locales].sort(),
    listings,
    productionRolloutFraction: config.productionRolloutFraction,
    subscriptions: [...config.subscriptions],
  };
}

export { IMAGE_TYPES, LISTING_FIELDS, releaseRolloutFraction };
