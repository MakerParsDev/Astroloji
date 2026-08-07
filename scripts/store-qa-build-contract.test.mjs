import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const gradle = fs.readFileSync('Astroloji/app/build.gradle.kts', 'utf8');

test('storeQa is isolated from production package identity', () => {
  assert.match(gradle, /create\("storeQa"\)/);
  assert.match(gradle, /initWith\(getByName\("debug"\)\)/);
  assert.match(gradle, /applicationIdSuffix\s*=\s*"\.storeqa"/);
  assert.match(gradle, /versionNameSuffix\s*=\s*"-storeqa"/);
  assert.match(gradle, /buildConfigField\("boolean",\s*"STORE_SCREENSHOT_QA",\s*"true"\)/);
  assert.match(gradle, /sourceSets\.named\("storeQa"\)[\s\S]{0,120}kotlin\.directories\s*\+=\s*"src\/debug\/java"/);
  assert.match(gradle, /add\("storeQaImplementation",\s*libs\.firebase\.appcheck\.debug\)/);
  assert.doesNotMatch(gradle, /release[\s\S]{0,500}applicationIdSuffix\s*=\s*"\.storeqa"/);
});

test('storeQa Firebase config uses an ignored local file with a sanitized build fallback', () => {
  const ignore = fs.readFileSync('.gitignore', 'utf8');
  const examplePath = 'Astroloji/app/src/storeQa/google-services.example.json';
  assert.match(ignore, /Astroloji\/app\/src\/storeQa\/google-services\.json/);
  assert.ok(fs.existsSync(examplePath), 'storeQa sanitized Firebase example must exist');
  const example = fs.readFileSync(examplePath, 'utf8');
  assert.match(example, /"package_name"\s*:\s*"com\.parsfilo\.astrology\.storeqa"/);
  assert.doesNotMatch(example, /AIza[0-9A-Za-z_-]{20,}/);
  assert.match(gradle, /prepareStoreQaGoogleServices/);
  assert.match(gradle, /google-services\.example\.json/);
  assert.match(gradle, /processStoreQaGoogleServices[\s\S]{0,160}dependsOn\(prepareStoreQaGoogleServices\)/);
});
