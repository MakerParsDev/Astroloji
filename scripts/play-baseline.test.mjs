import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPlayBaseline,
  metric,
  unavailableMetric,
  validateBaseline,
} from './capture-play-baseline.mjs';

const window = { start: '2026-07-04', end: '2026-08-02' };

test('baseline preserves measured aggregates and unavailable metrics without inventing zeroes', () => {
  const baseline = buildPlayBaseline({
    collectedAt: '2026-08-07T04:10:00.000Z',
    window,
    play: {
      productionRolloutFraction: metric(1, 'Google Play Android Publisher API'),
      ratings: unavailableMetric('Play review/vitals provider unavailable during capture.'),
      reviews: unavailableMetric('Play review/vitals provider unavailable during capture.'),
    },
    stability: {
      crashRate: unavailableMetric('Play Developer Reporting access unavailable during capture.'),
      anrRate: unavailableMetric('Play Developer Reporting access unavailable during capture.'),
    },
    analytics: {
      activeUsers: unavailableMetric('Property-level GA4 summary is not app-stream isolated.'),
      sessions: unavailableMetric('Property-level GA4 summary is not app-stream isolated.'),
      events: unavailableMetric('Property-level GA4 summary is not app-stream isolated.'),
    },
    subscriptions: {
      premiumScreenViews: unavailableMetric('App-stream event query not yet isolated.'),
      purchaseStarts: unavailableMetric('App-stream event query not yet isolated.'),
      verifiedPurchases: unavailableMetric('No aggregate verified-purchase collector is available.'),
    },
    ads: {
      requests: metric(202, 'AdMob network report, Astroloji app filter'),
      matchedRequests: metric(154, 'AdMob network report, Astroloji app filter'),
      impressions: metric(22, 'AdMob network report, Astroloji app filter'),
    },
  });

  assert.deepEqual(baseline.window, window);
  assert.equal(baseline.play.productionRolloutFraction.value, 1);
  assert.equal(baseline.ads.requests.value, 202);
  assert.equal(baseline.analytics.activeUsers.value, null);
  assert.match(baseline.analytics.activeUsers.unavailableReason, /not app-stream isolated/i);
  assert.equal(validateBaseline(baseline).length, 0);
});

test('unavailable metric requires a non-empty reason and never defaults null to zero', () => {
  assert.throws(() => unavailableMetric(''), /reason/i);
  assert.deepEqual(unavailableMetric('not available'), {
    value: null,
    unavailableReason: 'not available',
  });
});

test('baseline rejects invented zero unavailable metrics and identity fields', () => {
  const baseline = buildPlayBaseline({
    collectedAt: '2026-08-07T04:10:00.000Z',
    window,
    play: {
      productionRolloutFraction: metric(1, 'play'),
      ratings: { value: 0, unavailableReason: 'not available' },
      reviews: unavailableMetric('not available'),
    },
    stability: {
      crashRate: unavailableMetric('not available'),
      anrRate: unavailableMetric('not available'),
    },
    analytics: {
      activeUsers: unavailableMetric('not available'),
      sessions: unavailableMetric('not available'),
      events: unavailableMetric('not available'),
    },
    subscriptions: {
      premiumScreenViews: unavailableMetric('not available'),
      purchaseStarts: unavailableMetric('not available'),
      verifiedPurchases: unavailableMetric('not available'),
    },
    ads: {
      requests: metric(202, 'admob'),
      matchedRequests: metric(154, 'admob'),
      impressions: metric(22, 'admob'),
    },
  });
  baseline.play.ratings = { value: 0, unavailableReason: 'not available' };
  baseline.accountEmail = 'forbidden@example.invalid';

  const errors = validateBaseline(baseline);
  assert.ok(errors.some((error) => /value must be null/i.test(error)));
  assert.ok(errors.some((error) => /identity/i.test(error)));
});

test('baseline validates fixed 30-day inclusive window', () => {
  const invalid = buildPlayBaseline({
    collectedAt: '2026-08-07T04:10:00.000Z',
    window: { start: '2026-07-05', end: '2026-08-02' },
    play: {}, stability: {}, analytics: {}, subscriptions: {}, ads: {},
  });
  assert.ok(validateBaseline(invalid).some((error) => /30-day/i.test(error)));
});

import fs from 'node:fs';

const baselinePath = new URL('../docs/PLAY_STORE_BASELINE_2026-08-06.json', import.meta.url);
const measurementPath = new URL('../docs/PLAY_STORE_MEASUREMENT.md', import.meta.url);

test('committed baseline is redacted, fixed-window, and records the observed live rollout', () => {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  assert.equal(validateBaseline(baseline).length, 0);
  assert.deepEqual(baseline.window, window);
  assert.equal(baseline.play.productionRolloutFraction.value, 1);
  assert.equal(baseline.subscriptions.verifiedPurchases.value, 0);
  assert.equal(baseline.ads.requests.value, 202);
  const serialized = JSON.stringify(baseline);
  assert.doesNotMatch(serialized, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.doesNotMatch(serialized, /\"(?:userId|user_id|deviceId|device_id|accountEmail|purchaseToken)\"\s*:/i);
});

test('measurement governance rejects causal claims and treats rollout drift as a separate decision', () => {
  const doc = fs.readFileSync(measurementPath, 'utf8');
  assert.match(doc, /does not prove causation/i);
  assert.match(doc, /production rollout.*1\.0|100%/i);
  assert.match(doc, /approved.*0\.1|10%/i);
  assert.match(doc, /separate.*rollout.*decision/i);
  assert.match(doc, /metadata publication.*blocked|block.*metadata publication/i);
  assert.match(doc, /observation window/i);
});

test('metric rejects coercible non-numeric inputs and non-finite values', () => {
  for (const value of ['', '   ', false, Infinity, -Infinity, NaN]) {
    assert.throws(() => metric(value, 'source'), /numeric|finite/i, `Expected rejection for ${String(value)}`);
  }
});

test('baseline metric normalization whitelists fields and drops arbitrary sensitive input keys', () => {
  const baseline = buildPlayBaseline({
    collectedAt: '2026-08-07T04:10:00.000Z',
    window,
    play: {
      productionRolloutFraction: {
        value: 1,
        source: 'play',
        accessToken: 'must-not-survive',
        privateKey: 'must-not-survive',
        purchaseToken: 'must-not-survive',
      },
    },
    stability: {}, analytics: {}, subscriptions: {}, ads: {},
  });
  const serialized = JSON.stringify(baseline);
  assert.doesNotMatch(serialized, /must-not-survive|accessToken|privateKey|purchaseToken/);
  assert.deepEqual(baseline.play.productionRolloutFraction, { value: 1, source: 'play' });
});

test('baseline rejects normalized impossible calendar dates', () => {
  const invalid = buildPlayBaseline({
    collectedAt: '2026-08-07T04:10:00.000Z',
    window: { start: '2026-02-30', end: '2026-03-31' },
    play: {}, stability: {}, analytics: {}, subscriptions: {}, ads: {},
  });
  assert.ok(validateBaseline(invalid).some((error) => /window start\/end/i.test(error)));
});


test('baseline rejects identifier-bearing metric source strings', () => {
  assert.throws(
    () => metric(1, 'report for alice@example.invalid'),
    /identifier|email|redact/i,
  );
  const baseline = buildPlayBaseline({
    collectedAt: '2026-08-07T04:10:00.000Z',
    window,
    play: { productionRolloutFraction: metric(1, 'Google Play API') },
    stability: {}, analytics: {}, subscriptions: {}, ads: {},
  });
  baseline.play.productionRolloutFraction.source = 'alice@example.invalid';
  assert.ok(validateBaseline(baseline).some((error) => /identifier|email|redact/i.test(error)));
});
