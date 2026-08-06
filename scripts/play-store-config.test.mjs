import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLocaleContract,
  loadStoreConfig,
  readAndroidLocales,
} from "./lib/play-store-config.mjs";

test("Android en/tr locales map exactly to en-US and tr-TR Play locales", () => {
  const config = loadStoreConfig(process.cwd());
  const android = readAndroidLocales(process.cwd());
  assert.deepEqual(android, ["en", "tr"]);
  assert.deepEqual(config.locales, ["en-US", "tr-TR"]);
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

test('store config binds shared assets to the Turkish default listing', () => {
  const config = loadStoreConfig(process.cwd());
  assert.equal(config.defaultLocale, 'tr-TR');
  assert.ok(config.locales.includes(config.defaultLocale));
});
