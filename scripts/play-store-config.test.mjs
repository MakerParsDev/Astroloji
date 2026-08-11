import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLocaleContract,
  loadStoreConfig,
  readAndroidLocales,
} from "./lib/play-store-config.mjs";

test("Android en/es/tr locales map exactly to en-US, es-ES, and tr-TR Play locales", () => {
  const config = loadStoreConfig(process.cwd());
  const android = readAndroidLocales(process.cwd());
  assert.deepEqual(android, ["en", "es", "tr"]);
  assert.deepEqual(config.locales, ["en-US", "tr-TR", "es-ES"]);
  assert.doesNotThrow(() => assertLocaleContract(config, android));
});

test("unsupported Play locale is rejected", () => {
  assert.throws(
    () =>
      assertLocaleContract(
        {
          locales: ["de-DE", "en-US", "tr-TR"],
          androidLocaleMap: { en: "en-US", tr: "tr-TR" },
        },
        ["en", "tr"],
      ),
    /Unsupported Play locale: de-DE/,
  );
});

test("missing Play locale is rejected", () => {
  assert.throws(
    () =>
      assertLocaleContract(
        {
          locales: ["en-US"],
          androidLocaleMap: { en: "en-US", tr: "tr-TR" },
        },
        ["en", "tr"],
      ),
    /Missing Play locale: tr-TR/,
  );
});

test('store config owns the canonical monthly and weekly subscription pairs', () => {
  const config = loadStoreConfig(process.cwd());
  assert.deepEqual(config.subscriptions, [
    { productId: 'premium_monthly', basePlanId: 'monthly' },
    { productId: 'premium_weekly', basePlanId: 'weekly' },
  ]);
});

test('store config matches the completed production rollout contract', () => {
  const config = loadStoreConfig(process.cwd());
  assert.equal(config.productionRolloutFraction, 1);
});

test('store config binds shared assets to the Turkish default listing', () => {
  const config = loadStoreConfig(process.cwd());
  assert.equal(config.defaultLocale, 'tr-TR');
  assert.ok(config.locales.includes(config.defaultLocale));
});


test('duplicate Play locale mappings are rejected', () => {
  assert.throws(
    () => assertLocaleContract(
      {
        locales: ['en-US'],
        androidLocaleMap: { en: 'en-US', 'en-GB': 'en-US' },
      },
      ['en', 'en-GB'],
    ),
    /Duplicate Play locale mapping: en-US/,
  );
});
