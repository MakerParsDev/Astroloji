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
  assert.match(workflow, /Autonomous production pipeline failed/);
  assert.match(workflow, /play-metadata:[\s\S]*issues:\s*write/);
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


test('CI blocks destructive autonomous migrations before backend verification', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /Verify autonomous migration safety/);
  assert.match(ci, /validate-autonomous-migrations\.mjs/);
  assert.match(ci, /backend-verify:[\s\S]*fetch-depth:\s*2/);
});


test('new production controllers install only checksum-pinned Doppler', () => {
  for (const name of ['android-metadata-autonomous.yml', 'android-rollout-controller.yml']) {
    const workflow = read(`.github/workflows/${name}`);
    assert.match(workflow, /Install pinned Doppler CLI/);
    assert.match(workflow, /DOPPLER_VERSION:\s*3\.76\.1/);
    assert.match(workflow, /DOPPLER_SHA256:\s*e35230bd21fdbd7e41ddcb24672ec61cecefdb22de244d0216ea6b59853f63f2/);
    assert.match(workflow, /sha256sum --check/);
    assert.match(workflow, /--proto '=https'/);
    assert.doesNotMatch(workflow, /cli\.doppler\.com\/install\.sh/);
  }
});

test('backend rollback executes the lockfile-installed Wrangler binary', () => {
  const workflow = read('.github/workflows/backend-production-deploy.yml');
  assert.match(workflow, /\.\/node_modules\/\.bin\/wrangler rollback --message/);
  assert.doesNotMatch(workflow, /npx wrangler rollback/);
});


test('production health watchdog is hourly, credential-free, and incident-backed', () => {
  const workflow = read('.github/workflows/autonomous-production-health.yml');
  assert.match(workflow, /cron:\s*['"]23 \* \* \* \*['"]/);
  assert.match(workflow, /ENABLE_AUTONOMOUS_PRODUCTION/);
  assert.match(workflow, /api\/v1\/health/);
  assert.match(workflow, /api\/v1\/users\/me/);
  assert.match(workflow, /api\/v1\/admin\/content\/backfill/);
  assert.match(workflow, /api\/v1\/webhooks\/play-rtdn/);
  assert.match(workflow, /issues:\s*write/);
  assert.match(workflow, /Autonomous production health check failed/);
  assert.match(workflow, /gh issue close/);
  assert.doesNotMatch(workflow, /DOPPLER_TOKEN|PLAY_SERVICE_ACCOUNT|CLOUDFLARE_API_TOKEN/);
});
