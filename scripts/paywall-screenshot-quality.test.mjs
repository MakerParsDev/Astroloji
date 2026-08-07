import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const catalog = readFileSync('Astroloji/gradle/libs.versions.toml', 'utf8');
const rootBuild = readFileSync('Astroloji/build.gradle.kts', 'utf8');
const appBuild = readFileSync('Astroloji/app/build.gradle.kts', 'utf8');
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const previewPath = 'Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/feature/premium/PremiumOfferScreenshotTest.kt';
const referenceRoot = 'Astroloji/app/src/screenshotTestDebug/reference';

test('paywall screenshot tests are configured and enforced in CI', () => {
  assert.match(catalog, /compose-screenshot\s*=\s*\{\s*id\s*=\s*"com\.android\.compose\.screenshot"/);
  assert.match(catalog, /screenshot-validation-api/);
  assert.match(rootBuild, /alias\(libs\.plugins\.compose\.screenshot\) apply false/);
  assert.match(appBuild, /alias\(libs\.plugins\.compose\.screenshot\) apply false/);
  assert.match(appBuild, /val screenshotTestsEnabled[\s\S]*extensions\.configure<ApplicationExtension>[\s\S]*experimentalProperties\["android\.experimental\.enableScreenshotTest"\][\s\S]*apply\(plugin = "com\.android\.compose\.screenshot"\)/);
  assert.match(appBuild, /if \(screenshotTestsEnabled\)[\s\S]*add\("screenshotTestImplementation", libs\.screenshot\.validation\.api\)/);
  assert.match(appBuild, /screenshotRuntimeExcludedGroups[\s\S]*"com\.google\.firebase"[\s\S]*name\.contains\("ScreenshotTest"/);
  assert.ok(existsSync(previewPath), 'Paywall screenshot preview source must exist.');
  assert.match(readFileSync(previewPath, 'utf8'), /@PreviewTest/);
  assert.match(readFileSync(previewPath, 'utf8'), /PremiumOfferCard/);
  assert.match(ci, /name:\s*Play store and paywall screenshot tests[\s\S]*?validateDebugScreenshotTest/);
  assert.match(ci, /android\.sync\.suppressAgpWarnings=UNSUPPORTED_PROJECT_OPTION_USE/);
});

test('paywall screenshot golden references are checked in', () => {
  assert.ok(existsSync(referenceRoot), 'Screenshot reference directory must exist.');
  const pngs = readdirSync(referenceRoot, { recursive: true })
    .filter((name) => String(name).endsWith('.png'));
  assert.ok(pngs.length >= 2, `Expected at least two paywall golden images, found ${pngs.length}.`);
});
