import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflowPath = new URL('../.github/workflows/android-internal-preflight.yml', import.meta.url);
const workflow = fs.readFileSync(workflowPath, 'utf8');
const releaseWorkflowPath = new URL('../.github/workflows/android-internal-release.yml', import.meta.url);
const releaseWorkflow = fs.readFileSync(releaseWorkflowPath, 'utf8');

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


test('internal workflows enforce version code 1101 or the next Play code', () => {
  for (const source of [workflow, releaseWorkflow]) {
    assert.match(source, /MINIMUM_INTERNAL_VERSION_CODE:\s*["']1101["']/);
    assert.match(source, /id:\s*play_access/);
    assert.match(
      source,
      /REQUIRED_VERSION_CODE:\s*\$\{\{ steps\.play_access\.outputs\.recommended_version_code \}\}/,
    );
    assert.match(source, /assertRequestedVersionCode/);
  }
});

test('internal release validates Play version before build and publish', () => {
  const accessIndex = releaseWorkflow.indexOf('id: play_access');
  const validationIndex = releaseWorkflow.indexOf('assertRequestedVersionCode');
  const buildIndex = releaseWorkflow.indexOf('Build signed release bundle');
  const publishIndex = releaseWorkflow.indexOf('Publish to Play internal track');

  assert.ok(accessIndex > 0);
  assert.ok(validationIndex > accessIndex);
  assert.ok(buildIndex > validationIndex);
  assert.ok(publishIndex > buildIndex);
});
