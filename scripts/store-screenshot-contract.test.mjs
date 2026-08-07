import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const sourcePath = 'Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/store/StoreListingScreenshotTest.kt';

test('store listing screenshot source defines twelve localized previews', () => {
  assert.ok(fs.existsSync(sourcePath), 'Store listing screenshot source must exist.');
  const source = fs.readFileSync(sourcePath, 'utf8');
  for (const scene of ['Daily', 'Guidance', 'Compatibility', 'Personality', 'Tools', 'Premium']) {
    assert.match(source, new RegExp(`Store${scene}EnglishScreenshot`));
    assert.match(source, new RegExp(`Store${scene}TurkishScreenshot`));
  }
  assert.equal((source.match(/@PreviewTest/g) ?? []).length, 12);
  assert.doesNotMatch(source, /email|token|firebase|device id|test user/i);
});

test('store scenes use production visual components and monthly plus weekly plans only', () => {
  assert.ok(fs.existsSync(sourcePath), 'Store listing screenshot source must exist.');
  const source = fs.readFileSync(sourcePath, 'utf8');
  for (const component of ['CosmicBackground', 'AstrologyCard', 'AstroSectionTitle', 'PremiumOfferCard']) {
    assert.match(source, new RegExp(component));
  }
  assert.match(source, /premium_monthly/);
  assert.match(source, /premium_weekly/);
  assert.doesNotMatch(source, /premium_yearly/);
});

test('CI explicitly validates paywall and Play store screenshot suites', () => {
  const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(ci, /name:\s*Play store and paywall screenshot tests/);
  assert.match(ci, /validateDebugScreenshotTest/);
  assert.match(ci, /android\.experimental\.enableScreenshotTest=true/);
  assert.match(ci, /android\.sync\.suppressAgpWarnings=UNSUPPORTED_PROJECT_OPTION_USE/);
});

test('feature graphics and shared icon have deterministic Compose previews', () => {
  const featurePath = 'Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/store/StoreFeatureGraphicScreenshotTest.kt';
  assert.ok(fs.existsSync(featurePath), 'Feature graphic screenshot source must exist.');
  const source = fs.readFileSync(featurePath, 'utf8');
  for (const preview of [
    'StoreFeatureGraphicEnglishScreenshot',
    'StoreFeatureGraphicTurkishScreenshot',
    'StoreAppIconScreenshot',
  ]) {
    assert.match(source, new RegExp(preview));
  }
  assert.equal((source.match(/@PreviewTest/g) ?? []).length, 3);
  assert.match(source, /spec:width=1024dp,height=500dp,dpi=160/);
  assert.match(source, /spec:width=512dp,height=512dp,dpi=160/);
  assert.doesNotMatch(source, /rating|award|testimonial|countdown|discount/i);
});

test('all visible store-scene labels are supplied by localized copy and premium prices use matching micros', () => {
  const scene = fs.readFileSync(sourcePath, 'utf8');
  const fixtures = fs.readFileSync(
    'Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/store/StoreScreenshotFixtures.kt',
    'utf8',
  );
  for (const hardcoded of [
    '"Aries"', '"Today"', '"A confident start"', '"Energy"', '"Love"', '"Work"',
    '"Best day · Thursday"', '"Friendship"', '"Fire · Mars"', '"Deeper insight"',
    '"♈  Today · 88%"',
  ]) {
    assert.doesNotMatch(scene, new RegExp(hardcoded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const localized of [
    'Koç', 'Bugün', 'Güçlü bir başlangıç', 'Enerji', 'Aşk', 'İş', 'En güçlü gün · Perşembe',
    'Arkadaşlık', 'Ateş · Mars', 'Daha derin içgörü', 'Aylık', 'Haftalık',
  ]) {
    assert.match(fixtures, new RegExp(localized));
  }
  assert.match(fixtures, /monthlyPriceMicros = if \(isTurkish\) 394_990_000L else 6_990_000L/);
  assert.match(fixtures, /weeklyPriceMicros = if \(isTurkish\) 129_990_000L else 2_290_000L/);
});
