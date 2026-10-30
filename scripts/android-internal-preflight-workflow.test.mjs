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

test('Crashlytics mapping upload is opt-in for local builds but enabled explicitly in release workflows', () => {
  const gradleConfig = fs.readFileSync(new URL('../Astroloji/app/build.gradle.kts', import.meta.url), 'utf8');
  const exampleConfig = fs.readFileSync(new URL('../Astroloji/gradle.properties.example', import.meta.url), 'utf8');
  const productionWorkflow = fs.readFileSync(new URL('../.github/workflows/android-production-release.yml', import.meta.url), 'utf8');

  assert.match(gradleConfig, /stringConfig\("CRASHLYTICS_MAPPING_UPLOAD_ENABLED", "false"\)\.toBoolean\(\)/);
  assert.match(exampleConfig, /^CRASHLYTICS_MAPPING_UPLOAD_ENABLED=false$/m);
  assert.match(workflow, /CRASHLYTICS_MAPPING_UPLOAD_ENABLED: false/);
  assert.match(releaseWorkflow, /CRASHLYTICS_MAPPING_UPLOAD_ENABLED: true/);
  assert.match(productionWorkflow, /CRASHLYTICS_MAPPING_UPLOAD_ENABLED: true/);
});

test('preflight summary passes dynamic values through shell environment instead of inline expressions', () => {
  const summary = workflow.slice(workflow.indexOf('name: Publish preflight summary'));
  assert.ok(summary.includes('PLAY_MAX_VERSION_CODE: '+ String.fromCharCode(36) + '{{ steps.play_access.outputs.max_version_code }}'));
  assert.ok(summary.includes('PREFLIGHT_GIT_SHA: '+ String.fromCharCode(36) + '{{ github.sha }}'));
  assert.match(summary, /echo "- Current maximum version code: \$PLAY_MAX_VERSION_CODE"/);
  assert.match(summary, /echo "- Git SHA: \$PREFLIGHT_GIT_SHA"/);
  assert.doesNotMatch(summary, /echo[^\n]*\$\{\{/);
});
