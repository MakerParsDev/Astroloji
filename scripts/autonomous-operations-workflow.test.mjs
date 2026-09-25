import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(path, 'utf8');

test('production orchestrator chains from successful main CI and uses exact release SHA', () => {
  const workflow = read('.github/workflows/autonomous-production.yml');
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows:\s*\[ci\]/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /autonomous-release-plan\.mjs/);
  assert.match(workflow, /backend-production-deploy\.yml/);
  assert.match(workflow, /android-internal-release\.yml/);
  assert.match(workflow, /android-production-release\.yml/);
  assert.match(workflow, /android-metadata-autonomous\.yml/);
});

test('backend production workflow supports trusted reusable automation and rollback', () => {
  const workflow = read('.github/workflows/backend-production-deploy.yml');
  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /release_sha:/);
  assert.match(workflow, /Verify immutable main release SHA/);
  assert.match(workflow, /wrangler rollback --message/);
});

test('Android release workflows support exact-sha autonomous internal then staged production', () => {
  const internal = read('.github/workflows/android-internal-release.yml');
  const production = read('.github/workflows/android-production-release.yml');
  assert.match(internal, /workflow_call:/);
  assert.match(internal, /recommended_version_code/);
  assert.match(internal, /version_code:/);
  assert.match(production, /workflow_call:/);
  assert.match(production, /release_sha:/);
  assert.match(production, /auto-v1-/);
  assert.match(production, /release-status="inProgress"|release-status=\"inProgress\"/);
});

test('rollout controller is scheduled and uses Play vitals-aware reconciler', () => {
  const workflow = read('.github/workflows/android-rollout-controller.yml');
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /reconcile-play-rollout\.mjs/);
  assert.match(workflow, /ENABLE_PRODUCTION_RELEASE/);
  assert.match(workflow, /ENABLE_AUTONOMOUS_PRODUCTION/);
});

test('metadata reconciliation and horoscope backfill are autonomous but kill-switchable', () => {
  const metadata = read('.github/workflows/android-metadata-autonomous.yml');
  const content = read('.github/workflows/content-backfill.yml');
  assert.match(metadata, /workflow_call:/);
  assert.match(metadata, /schedule:/);
  assert.match(metadata, /release_sha:/);
  assert.match(metadata, /reconcile-play-metadata\.mjs/);
  assert.match(metadata, /ENABLE_METADATA_PUBLISH/);
  assert.match(content, /ENABLE_AUTONOMOUS_PRODUCTION/);
  assert.match(content, /ENABLE_CONTENT_BACKFILL/);
  assert.match(content, /issues:\s*write/);
});

test('PR policy no longer relies on pull_request_target and exposes low/elevated/blocked tiers', () => {
  const workflow = read('.github/workflows/opencode-pr-policy.yml');
  assert.doesNotMatch(workflow, /pull_request_target:/);
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /autonomous-merge-eligible/);
  assert.match(workflow, /risk:elevated/);
  assert.match(workflow, /risk:blocked/);
});
