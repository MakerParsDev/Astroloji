import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const runnerPath = new URL('./run-android-device-smoke.sh', import.meta.url);

test('device smoke runner is exact-targeted and preserves the owner app', () => {
  assert.equal(existsSync(runnerPath), true, 'device smoke runner must exist');
  const script = readFileSync(runnerPath, 'utf8');

  assert.match(script, /SERIAL="\$\{1:\?Usage:/);
  assert.match(script, /adb -s "\$SERIAL"/);
  assert.match(script, /OWNER_PACKAGE="com\.parsfilo\.astrology"/);
  assert.match(script, /SMOKE_PACKAGE="com\.parsfilo\.astrology\.devicesmoke"/);
  assert.match(script, /SMOKE_TEST_PACKAGE="com\.parsfilo\.astrology\.devicesmoke\.test"/);
  assert.match(script, /trap cleanup EXIT INT TERM/);
  assert.match(script, /owner_version_before/);
  assert.match(script, /owner_version_after/);
  assert.match(script, /aapt2 dump resources/);
  assert.match(script, /firebaseApiKey/);

  assert.doesNotMatch(script, /pm clear\s+com\.parsfilo\.astrology/);
  assert.doesNotMatch(script, /pm uninstall\s+com\.parsfilo\.astrology(?:\s|$)/);
  assert.doesNotMatch(script, /run-as\s+com\.parsfilo\.astrology/);
  assert.doesNotMatch(script, /\/data\/user\/0\/com\.parsfilo\.astrology/);
});

test('device smoke module is isolated and compile-only', () => {
  const settings = readFileSync(new URL('../Astroloji/settings.gradle.kts', import.meta.url), 'utf8');
  const catalog = readFileSync(new URL('../Astroloji/gradle/libs.versions.toml', import.meta.url), 'utf8');
  const moduleBuildPath = new URL('../Astroloji/device-smoke/build.gradle.kts', import.meta.url);
  const manifestPath = new URL('../Astroloji/device-smoke/src/main/AndroidManifest.xml', import.meta.url);

  assert.match(settings, /include\(":device-smoke"\)/);
  assert.equal(existsSync(moduleBuildPath), true, 'device smoke build file must exist');
  assert.equal(existsSync(manifestPath), true, 'device smoke manifest must exist');

  const build = readFileSync(moduleBuildPath, 'utf8');
  const manifest = readFileSync(manifestPath, 'utf8');
  assert.match(build, /applicationId\s*=\s*"com\.parsfilo\.astrology\.devicesmoke"/);
  assert.match(build, /minSdk\s*=\s*24/);
  assert.match(build, /targetSdk\s*=\s*37/);
  assert.match(build, /testInstrumentationRunner\s*=\s*"androidx\.test\.runner\.AndroidJUnitRunner"/);
  assert.match(build, /implementation\(libs\.firebase\.installations\)/);
  assert.match(catalog, /firebase-installations\s*=\s*\{\s*group\s*=\s*"com\.google\.firebase",\s*name\s*=\s*"firebase-installations"/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.doesNotMatch(manifest, /android\.intent\.category\.LAUNCHER/);
});
