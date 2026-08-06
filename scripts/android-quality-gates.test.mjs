import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const build = readFileSync(new URL('../Astroloji/app/build.gradle.kts', import.meta.url), 'utf8');
const manifest = readFileSync(
  new URL('../Astroloji/app/src/main/AndroidManifest.xml', import.meta.url),
  'utf8',
);
const unitTestManifest = readFileSync(
  new URL('../Astroloji/app/src/test/AndroidManifest.xml', import.meta.url),
  'utf8',
);
const debugUnitTestManifest = readFileSync(
  new URL('../Astroloji/app/src/testDebug/AndroidManifest.xml', import.meta.url),
  'utf8',
);
const defaultStrings = readFileSync(
  new URL('../Astroloji/app/src/main/res/values/strings.xml', import.meta.url),
  'utf8',
);
const extractionRules = readFileSync(
  new URL('../Astroloji/app/src/main/res/xml/data_extraction_rules.xml', import.meta.url),
  'utf8',
);

test('Android CI fails closed on lint errors and warnings', () => {
  assert.match(ci, /name:\s*Android Lint[\s\S]*?\.\/gradlew :app:lintDebug/);
  assert.match(build, /lint\s*\{[\s\S]*?warningsAsErrors\s*=\s*true/);
  assert.doesNotMatch(build, /lint-baseline\.xml|baseline\s*=\s*file\([^)]*lint/i);
});

test('default English locale is explicit without a partial values-en overlay', () => {
  assert.match(defaultStrings, /tools:locale="en"/);
  assert.equal(
    existsSync(new URL('../Astroloji/app/src/main/res/values-en/strings.xml', import.meta.url)),
    false,
  );
});

test('cloud backup and device transfer exclude private application storage', () => {
  assert.match(extractionRules, /<cloud-backup>[\s\S]*?<exclude domain="sharedpref" path="\." \/>/);
  assert.match(extractionRules, /<device-transfer>[\s\S]*?<exclude domain="database" path="\." \/>/);
});

test('custom WorkManager initialization is removed cleanly from app and unit-test manifests', () => {
  assert.match(
    manifest,
    /android:name="androidx\.work\.WorkManagerInitializer"[\s\S]*tools:node="remove"/,
  );
  assert.doesNotMatch(manifest, /tools:selector=/);
  assert.match(unitTestManifest, /android:name="androidx\.work\.WorkManagerInitializer"/);
  assert.match(debugUnitTestManifest, /android:name="androidx\.work\.WorkManagerInitializer"[\s\S]*tools:node="remove"/);
});

test('Android CI compiles the isolated physical-device smoke suite without executing it', () => {
  assert.match(
    ci,
    /name:\s*Device smoke APK compile[\s\S]*?\.\/gradlew :device-smoke:assembleDebug :device-smoke:assembleDebugAndroidTest/,
  );
  assert.doesNotMatch(ci, /run-android-device-smoke\.sh|am instrument/);
});
