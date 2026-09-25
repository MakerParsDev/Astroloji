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
  assert.match(ci, /backend-verify:[\s\S]*fetch-depth:\s*0/);
});


test('autonomous production workflows install only checksum-pinned Doppler', () => {
  for (const name of ['backend-production-deploy.yml', 'android-internal-release.yml', 'android-production-release.yml', 'android-metadata-autonomous.yml', 'android-rollout-controller.yml']) {
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


test('production backend mutations use only the lockfile-installed Wrangler binary', () => {
  const workflow = read('.github/workflows/backend-production-deploy.yml');
  assert.match(workflow, /\.\/node_modules\/\.bin\/wrangler d1 execute astrology-db --remote/);
  assert.match(workflow, /\.\/node_modules\/\.bin\/wrangler d1 migrations apply astrology-db --remote/);
  assert.match(workflow, /\.\/node_modules\/\.bin\/wrangler rollback --message/);
  assert.doesNotMatch(workflow, /\bnpx wrangler\b/);
});


test('autonomous release workflows recheck current main immediately before every remote mutation', () => {
  const cases = [
    ['backend-production-deploy.yml', 'Apply rewarded SSV D1 migration'],
    ['android-internal-release.yml', 'Publish to Play internal track'],
    ['android-production-release.yml', 'Publish new production rollout'],
    ['android-metadata-autonomous.yml', 'Reconcile canonical metadata with live Play state'],
  ];
  for (const [name, mutation] of cases) {
    const workflow = read(`.github/workflows/${name}`);
    const recheck = workflow.lastIndexOf('Reverify current main immediately before production mutation');
    const mutationIndex = workflow.indexOf(mutation);
    assert.ok(recheck >= 0 && mutationIndex > recheck, `${name} must recheck main immediately before ${mutation}`);
    const between = workflow.slice(recheck, mutationIndex);
    assert.match(between, /git fetch --no-tags --no-recurse-submodules origin main/);
    assert.match(between, /git rev-parse origin\/main/);
    assert.match(between, /RELEASE_SHA/);
  }
});


test('reusable autonomous release gates use explicit inputs instead of caller event names', () => {
  for (const name of ['backend-production-deploy.yml', 'android-internal-release.yml', 'android-production-release.yml']) {
    const workflow = read(`.github/workflows/${name}`);
    assert.match(workflow, /inputs\.autonomous\s*==\s*true/);
    assert.doesNotMatch(workflow, /github\.event_name\s*==\s*'workflow_call'/);
  }
});

test('production orchestrator keeps durable per-surface release baselines for catch-up', () => {
  const workflow = read('.github/workflows/autonomous-production.yml');
  assert.match(workflow, /Autonomous production state/);
  assert.match(workflow, /backend_sha/);
  assert.match(workflow, /android_sha/);
  assert.match(workflow, /play_metadata_sha/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /Update autonomous production state/);
});


test('maintenance ignores machine-owned production state issue', () => {
  const workflow = read('.github/workflows/opencode-maintenance.yml');
  assert.match(workflow, /Autonomous production state/);
  assert.match(workflow, /controller state, not maintenance work/);
});


test('disabled release switches retain their surface baselines for later catch-up', () => {
  const workflow = read('.github/workflows/autonomous-production.yml');
  assert.match(workflow, /play-metadata:[\s\S]*ENABLE_METADATA_PUBLISH == 'true'/);
  assert.match(workflow, /android-internal:[\s\S]*ENABLE_PRODUCTION_RELEASE == 'true'/);
  assert.match(workflow, /return result === 'success' \? releaseSha : previous/);
  assert.match(workflow, /github\.event_name == 'schedule'/);
});


test('autonomous production state issue rejects user-created lookalikes', () => {
  const workflow = read('.github/workflows/autonomous-production.yml');
  assert.equal((workflow.match(/github-actions\[bot\]/g) ?? []).length >= 2, true);
  assert.match(workflow, /issue\.title === title[\s\S]{0,120}issue\.user\?\.login === 'github-actions\[bot\]'/);
});


test('CI validates the full PR or push migration range, not only HEAD parent', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /backend-verify:[\s\S]*fetch-depth:\s*0/);
  assert.match(ci, /MIGRATION_BASE:\s*\$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.before \|\| '' \}\}/);
  assert.match(ci, /MIGRATION_HEAD:\s*\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(ci, /git merge-base "\$MIGRATION_BASE" "\$MIGRATION_HEAD"/);
});

test('backend deploy validates catch-up range and remote pending migrations before D1 mutation', () => {
  const workflow = read('.github/workflows/backend-production-deploy.yml');
  const range = workflow.indexOf('Validate autonomous migration catch-up range');
  const pending = workflow.indexOf('Validate remote pending D1 migrations');
  const firstMutation = workflow.indexOf('Apply rewarded SSV D1 migration');
  assert.match(workflow, /migration_base_sha:/);
  assert.match(workflow, /SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'd1_migrations'/);
  assert.match(workflow, /MIGRATION_APPLIED_LIST_PATH/);
  assert.match(workflow, /MIGRATION_TRACKING_TABLE_PRESENT/);
  assert.match(workflow, /SELECT name FROM d1_migrations ORDER BY id/);
  assert.ok(range >= 0 && pending > range && firstMutation > pending);
});


test('Play rollout mutations require machine-owned exact release provenance', () => {
  const production = read('.github/workflows/android-production-release.yml');
  const orchestrator = read('.github/workflows/autonomous-production.yml');
  const controller = read('.github/workflows/android-rollout-controller.yml');
  assert.match(production, /outputs:[\s\S]*release_name:[\s\S]*jobs\.publish-production\.outputs\.release_name/);
  assert.match(production, /publish-production:[\s\S]*outputs:[\s\S]*steps\.release_identity\.outputs\.release_name/);
  assert.match(orchestrator, /android_release_sha/);
  assert.match(orchestrator, /android_release_name/);
  assert.match(orchestrator, /ANDROID_RELEASE_NAME_PUBLISHED/);
  assert.match(orchestrator, /releaseSha\.slice\(0, 7\)/);
  assert.match(orchestrator, /Successful autonomous Android production release has invalid provenance/);
  assert.match(controller, /Autonomous production state/);
  assert.match(controller, /android_release_sha/);
  assert.match(controller, /androidReleaseSha\.slice\(0, 7\)/);
  assert.match(controller, /github-actions\[bot\]/);
  assert.match(controller, /EXPECTED_AUTONOMOUS_RELEASE_NAME/);
});


test('Android catch-up baseline does not rewrite release provenance without a publish', () => {
  const workflow = read('.github/workflows/autonomous-production.yml');
  assert.match(workflow, /ANDROID_RELEASE_SHA_PREVIOUS/);
  assert.match(workflow, /readOptionalSha\('android_release_sha'\)/);
  assert.match(workflow, /let androidReleaseSha = process\.env\.ANDROID_RELEASE_SHA_PREVIOUS/);
  assert.match(workflow, /Stored Android release provenance is incomplete/);
  assert.match(workflow, /Stored Android release provenance is inconsistent/);
  assert.match(workflow, /ANDROID_PLANNED === 'true'[\s\S]*ANDROID_RESULT === 'success'[\s\S]*androidReleaseSha = releaseSha/);
  assert.match(workflow, /android_release_sha=\$\{androidReleaseSha\}/);
});


test('scheduled catch-up requires exact successful main CI before release planning', () => {
  const workflow = read('.github/workflows/autonomous-production.yml');
  assert.match(workflow, /actions:\s*read/);
  assert.match(workflow, /Require successful exact-main CI for catch-up release/);
  assert.match(workflow, /listWorkflowRuns/);
  assert.match(workflow, /workflow_id:\s*'ci\.yml'/);
  assert.match(workflow, /head_sha:\s*releaseSha/);
  assert.match(workflow, /run\.head_sha === releaseSha/);
  assert.match(workflow, /run\.head_branch === 'main'/);
  assert.match(workflow, /run\.event === 'push'/);
  assert.match(workflow, /run\.conclusion === 'success'/);
});
