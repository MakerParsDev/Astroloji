import { abandonEdit } from './play-edit.mjs';
import { releaseRolloutFraction } from './play-release.mjs';
const IMAGE_TYPES = ['icon', 'featureGraphic', 'phoneScreenshots'];
const TRACKS = ['production', 'internal'];

async function mapConcurrent(values, concurrency, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      results[index] = await mapper(values[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, values.length || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function normalizeImage(image) {
  return {
    id: image.id ?? null,
    sha1: image.sha1 ?? null,
    sha256: image.sha256 ?? null,
    url: image.url ?? null,
  };
}

function normalizeRelease(release) {
  return {
    name: release.name ?? null,
    status: release.status ?? null,
    userFraction: release.userFraction ?? null,
    versionCodes: [...(release.versionCodes ?? [])].map(String).sort(),
    releaseNotes: [...(release.releaseNotes ?? [])]
      .map((note) => ({ language: note.language, text: note.text }))
      .sort((a, b) => a.language.localeCompare(b.language)),
  };
}

function normalizeSubscription(subscription) {
  return {
    productId: subscription.productId,
    basePlans: [...(subscription.basePlans ?? [])]
      .map((plan) => ({ basePlanId: plan.basePlanId, state: plan.state ?? null }))
      .sort((a, b) => a.basePlanId.localeCompare(b.basePlanId)),
  };
}

export async function capturePlayBackup(
  client,
  { now = () => new Date().toISOString(), listingConcurrency = 4, defaultLocale = null } = {},
) {
  const edit = await client.createEdit();
  try {
    const listingRefs = [...(await client.listListings(edit.id))]
      .sort((a, b) => a.language.localeCompare(b.language));
    const listings = await mapConcurrent(listingRefs, listingConcurrency, async (ref) => {
      const [listing, ...imageLists] = await Promise.all([
        client.getListing(edit.id, ref.language),
        ...IMAGE_TYPES.map((imageType) => client.listImages(edit.id, ref.language, imageType)),
      ]);
      const images = Object.fromEntries(
        IMAGE_TYPES.map((imageType, index) => [
          imageType,
          imageLists[index]
            .map(normalizeImage)
            .sort((a, b) => String(a.id).localeCompare(String(b.id))),
        ]),
      );
      return {
        locale: ref.language,
        title: listing.title ?? '',
        shortDescription: listing.shortDescription ?? '',
        fullDescription: listing.fullDescription ?? '',
        video: listing.video ?? null,
        images,
      };
    });

    const tracks = {};
    for (const track of TRACKS) {
      const value = await client.getTrack(edit.id, track);
      tracks[track] = {
        track,
        releases: [...(value.releases ?? [])].map(normalizeRelease),
      };
    }

    const subscriptions = (await client.listSubscriptions())
      .map(normalizeSubscription)
      .sort((a, b) => a.productId.localeCompare(b.productId));

    if (defaultLocale !== null && !listings.some((listing) => listing.locale === defaultLocale)) {
      throw new Error(`Default locale is not present in Play listings: ${defaultLocale}`);
    }
    return {
      schemaVersion: 1,
      capturedAt: now(),
      packageName: client.packageName,
      defaultLocale,
      listings,
      tracks,
      subscriptions,
    };
  } finally {
    await abandonEdit(client, edit.id);
  }
}

function subscriptionPairs(subscriptions) {
  return subscriptions
    .flatMap((subscription) =>
      (subscription.basePlans ?? []).map(
        (plan) => `${subscription.productId}/${plan.basePlanId}`,
      ),
    )
    .sort();
}

export async function verifyLiveState(client, expected) {
  const live = await capturePlayBackup(client);
  const errors = [];

  const liveLocales = live.listings.map((listing) => listing.locale).sort();
  const expectedLocales = [...expected.locales].sort();
  if (JSON.stringify(liveLocales) !== JSON.stringify(expectedLocales)) {
    const unsupported = liveLocales.filter((locale) => !expectedLocales.includes(locale));
    const missing = expectedLocales.filter((locale) => !liveLocales.includes(locale));
    errors.push(
      `Listing locales differ: live_count=${liveLocales.length} expected_count=${expectedLocales.length} ` +
        `unsupported_count=${unsupported.length} missing=${missing.join(',') || 'none'}`,
    );
  }

  const liveFraction = releaseRolloutFraction(live.tracks.production);
  if (liveFraction !== expected.productionRolloutFraction) {
    errors.push(
      `Production rollout fraction differs: live=${String(liveFraction)} expected=${expected.productionRolloutFraction}`,
    );
  }

  const livePairs = subscriptionPairs(live.subscriptions);
  const expectedPairs = expected.subscriptions
    .map((item) => `${item.productId}/${item.basePlanId}`)
    .sort();
  for (const pair of expectedPairs.filter((pair) => !livePairs.includes(pair))) {
    errors.push(`Missing expected subscription: ${pair}`);
  }
  for (const pair of livePairs.filter((pair) => !expectedPairs.includes(pair))) {
    errors.push(`Unexpected live subscription: ${pair}`);
  }

  return errors;
}

export { IMAGE_TYPES, TRACKS };
