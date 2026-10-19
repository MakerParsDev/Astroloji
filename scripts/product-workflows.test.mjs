import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';

function workflow(name) {
  return readFileSync('.github/workflows/' + name + '.yml', 'utf8');
}

test('releases are manually dispatched from exact main', () => {
  for (const [file, confirmation] of [
    ['backend-production-deploy', 'DEPLOY'],
    ['android-internal-release', 'RELEASE_INTERNAL'],
    ['android-production-release', null],
  ]) {
    const source = workflow(file);
    const lines = source.split(/\r?\n/);
    const onStart = lines.findIndex((line) => line === 'on:');
    assert.ok(onStart >= 0, 'Missing on block');
    const eventNames = [];
    for (const line of lines.slice(onStart + 1)) {
      if (/^[^\s#]/.test(line)) break;
      const event = /^  ([a-zA-Z][a-zA-Z0-9_-]*):/.exec(line);
      if (event) eventNames.push(event[1]);
    }
    assert.deepEqual(eventNames, ['workflow_dispatch'], file + ' must have only a manual trigger');
    assert.match(source, /jobs:[\s\S]*?if: >-[\s\S]*?github\.event_name == 'workflow_dispatch'[\s\S]*?github\.ref == 'refs\/heads\/main'/);
    assert.match(source, /Verify immutable main release SHA/);
    assert.doesNotMatch(source, /workflow_call:|schedule:|inputs\.autonomous/);
    if (confirmation) assert.ok(source.includes("inputs.confirm == '" + confirmation + "'"));
  }
});

test('backend deploy and CI retain real D1 migration gates', () => {
  assert.match(workflow('backend-production-deploy'), /Validate remote pending D1 migrations/);
  assert.match(workflow('backend-production-deploy'), /validate-migrations\.mjs/);
  assert.match(workflow('ci'), /Verify migration safety/);
  assert.match(workflow('ci'), /validate-migrations\.mjs/);
  assert.ok(existsSync('scripts/validate-migrations.test.mjs'));
});

test('product content backfill keeps independent opt-in', () => {
  const content = workflow('content-backfill');
  assert.match(content, /ENABLE_CONTENT_BACKFILL/);
  assert.match(content, /workflow_dispatch/);
  assert.doesNotMatch(content, /ENABLE_AUTONOMOUS_PRODUCTION/);
});

test('remove only agent controllers, retain product publication paths', () => {
  for (const name of ['opencode-review','autonomous-production','autonomous-production-health','android-rollout-controller','android-metadata-autonomous']) {
    assert.equal(existsSync('.github/workflows/' + name + '.yml'), false);
  }
  for (const name of ['android-metadata','android-internal-preflight','backend-production-deploy','ci']) {
    assert.equal(existsSync('.github/workflows/' + name + '.yml'), true);
  }
});

test('Mergify requires existing CI rather than retired agent services', () => {
  const source = readFileSync('.mergify.yml', 'utf8');
  for (const check of ['secret-scan','backend-verify','android-verify','GitGuardian Security Checks','SonarCloud Code Analysis','semgrep-cloud-platform/scan']) {
    assert.ok(source.includes('check-success = ' + check));
  }
  assert.doesNotMatch(source, /check-success = review/);
});

test('backend rollback docs require reviewed main commit and guarded deploy workflow', () => {
  const runbook = readFileSync('RELEASE_RUNBOOK.md', 'utf8');
  assert.match(runbook, /rollback commit/);
  assert.match(runbook, /backend-production-deploy/);
  assert.match(runbook, /release_sha/);
  assert.doesNotMatch(runbook, /npm run deploy:doppler/);
});
