import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

test('product content backfill is scheduled independently of retired agent automation', () => {
  const content = workflow('content-backfill');
  assert.match(content, /github.event_name == 'schedule'/);
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

test('production release passes manual inputs as data, never interpolated Bash source', () => {
  const source = workflow('android-production-release');
  const lines = source.split(/\r?\n/);
  let runIndent = null;
  for (const line of lines) {
    const indent = line.match(/^\s*/)[0].length;
    if (/^\s*run:\s*(?:\||>-?)?\s*$/.test(line)) {
      runIndent = indent;
      continue;
    }
    if (runIndent !== null && line.trim() && indent <= runIndent) runIndent = null;
    if (runIndent !== null) {
      assert.doesNotMatch(line, /\$\{\{\s*inputs\./, `Unsafe direct dispatch input in Bash: ${line.trim()}`);
    }
  }
  assert.match(source, /--from-track="\$PROMOTE_FROM_TRACK"/);
  assert.match(source, /--user-fraction="\$PLAY_USER_FRACTION"/);
  assert.match(source, /--version-code="\$VERSION_CODE"/);
  assert.match(source, /if \[ -z "\$PROMOTE_FROM_TRACK" \]; then/);
  assert.match(source, /vars\.ENABLE_PRODUCTION_RELEASE == 'true'/);
  assert.match(source, /environment: production/);
});


// Extract the exact run block for sandbox Bash, never invoke real Gradle/Play.
function localProductionShell(name) {
  const source = workflow('android-production-release');
  const start = source.indexOf(`      - name: ${name}\n`);
  assert.ok(start >= 0, `Missing production step: ${name}`);
  const next = source.indexOf('\n      - name:', start + 1);
  const block = source.slice(start, next < 0 ? undefined : next);
  if (['Promote from an existing Play track', 'Publish summary'].includes(name)) {
    assert.match(block, /RELEASE_NAME: \$\{\{ steps\.release_identity\.outputs\.release_name \}\}/);
  }
  const run = block.match(/\n        run: (\||>-)\n((?:          [^\n]*(?:\n|$))*)/);
  assert.ok(run, `Missing multiline run in ${name}`);
  const lines = run[2].trimEnd().split('\n').map((line) => line.slice(10));
  return run[1] === '>-' ? lines.join(' ') : lines.join('\n');
}

test('production release actual Bash never re-evaluates manual data during promotion', (t) => {
  if (spawnSync('bash', ['--version'], { encoding: 'utf8', timeout: 3000 }).error?.code === 'ENOENT') {
    t.skip('Bash is required for Linux production workflow simulation');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'astro-prod-shell-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sentinel = join(dir, 'INJECTION_TRIGGERED');
  writeFileSync(join(dir, 'gradlew'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$ARGV_DUMP"\n');
  chmodSync(join(dir, 'gradlew'), 0o700);
  const promote = `internal$(touch ${sentinel})" ; echo unsafe`;
  const version = `1109$(touch ${sentinel})`;
  const fraction = '0.1 ; echo forbidden';
  const argvFile = join(dir, 'argv.txt');
  const result = spawnSync('bash', ['-e', '-u', '-o', 'pipefail', '-c', localProductionShell('Promote from an existing Play track')], {
    cwd: dir, encoding: 'utf8', timeout: 6000,
    env: { ...process.env, PROMOTE_FROM_TRACK: promote, PLAY_USER_FRACTION: fraction,
      VERSION_CODE: version, PLAY_TRACK_PRODUCTION: 'production', RELEASE_NAME: 'SafeRelease', ARGV_DUMP: argvFile },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(argvFile, 'utf8').trimEnd().split('\n'), [
    ':app:promoteReleaseArtifact', `--from-track=${promote}`, '--promote-track=production',
    '--release-name=SafeRelease', '--release-status=inProgress', `--user-fraction=${fraction}`,
    `--version-code=${version}`,
  ]);
  assert.equal(existsSync(sentinel), false, 'Malicious dispatch input executed as a shell command');
});

test('production summary treats special characters as data and keeps bundle/promotion paths', (t) => {
  if (spawnSync('bash', ['--version'], { encoding: 'utf8', timeout: 3000 }).error?.code === 'ENOENT') {
    t.skip('Bash is required for Linux production workflow simulation');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'astro-prod-summary-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sentinel = join(dir, 'INJECTION_TRIGGERED');
  const summary = join(dir, 'summary.md');
  const script = localProductionShell('Publish summary');
  for (const [track, expectsArtifact] of [['', true], ['internal', false]]) {
    const version = `1.0.$(touch ${sentinel})`;
    const result = spawnSync('bash', ['-e', '-u', '-o', 'pipefail', '-c', script], {
      cwd: dir, encoding: 'utf8', timeout: 6000,
      env: { ...process.env, VERSION_NAME: version, VERSION_CODE: '1109',
        PROMOTE_FROM_TRACK: track, PLAY_USER_FRACTION: '0.1', PLAY_TRACK_PRODUCTION: 'production',
        RELEASE_SHA: 'test-sha', RELEASE_NAME: 'SafeRelease', GITHUB_STEP_SUMMARY: summary },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = readFileSync(summary, 'utf8');
    assert.ok(output.includes(`- Version name: ${version}`));
    assert.ok(output.includes(`- Promote from track: ${track || 'n/a'}`));
    assert.equal(output.includes('- Artifact: android-production-release-1109'), expectsArtifact);
    assert.equal(existsSync(sentinel), false, 'Summary input executed as a shell command');
    writeFileSync(summary, '');
  }
});
