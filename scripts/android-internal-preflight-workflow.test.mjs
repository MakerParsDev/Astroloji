import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflowPath = new URL('../.github/workflows/android-internal-preflight.yml', import.meta.url);
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('internal preflight accepts explicit non-publishing APK version metadata', () => {
  assert.match(workflow, /version_code:\s*\n\s*description:/);
  assert.match(workflow, /version_name:\s*\n\s*description:/);
  assert.match(workflow, /VERSION_CODE:\s*\$\{\{ inputs\.version_code \}\}/);
  assert.match(workflow, /VERSION_NAME:\s*\$\{\{ inputs\.version_name \}\}/);
  assert.doesNotMatch(workflow, /VERSION_CODE:\s*\$\{\{ github\.run_number \}\}/);
});

test('internal preflight builds and verifies a signed APK without publishing', () => {
  assert.match(workflow, /\.\/gradlew :app:bundleRelease :app:assembleRelease/);
  assert.match(workflow, /"\$apksigner" verify --verbose --print-certs/);
  assert.match(workflow, /app\/build\/outputs\/apk\/release\/\*\.apk/);
  assert.match(workflow, /retention-days:\s*1/);
  assert.doesNotMatch(workflow, /publishReleaseBundle/);
});
