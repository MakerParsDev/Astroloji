import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workflow = fs.readFileSync(new URL('../.github/workflows/android-production-release.yml', import.meta.url), 'utf8');

function step(name) {
  const beginning = workflow.indexOf(`      - name: ${name}\n`);
  assert.notEqual(beginning, -1, `Missing step: ${name}`);
  const next = workflow.indexOf('\n      - name:', beginning + 1);
  return workflow.slice(beginning, next < 0 ? undefined : next);
}

test('production release preserves manual main, feature flag and protected environment gates', () => {
  assert.match(workflow, /github\.repository == 'MakerParsDev\/Astroloji'/);
  assert.match(workflow, /vars\.ENABLE_PRODUCTION_RELEASE == 'true'/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /Reverify current main immediately before production mutation/);
});

test('untrusted workflow_dispatch input is never interpolated inside production run scripts', () => {
  const lines = workflow.split(/\r?\n/);
  let runIndent = null;
  for (const line of lines) {
    const indent = line.match(/^\s*/)[0].length;
    if (/^\s*run:\s*(?:\||>-?)?\s*$/.test(line)) {
      runIndent = indent;
      continue;
    }
    if (runIndent !== null && line.trim() && indent <= runIndent) runIndent = null;
    if (runIndent !== null) {
      assert.doesNotMatch(line, /\$\{\{\s*inputs\./, `Dispatch input used as shell code: ${line.trim()}`);
    }
  }
});

test('production promotion passes operator inputs through environment variables', () => {
  const promote = step('Promote from an existing Play track');
  assert.match(promote, /PROMOTE_FROM_TRACK:\s*\$\{\{ inputs\.promote_from_track \}\}/);
  assert.match(promote, /PLAY_USER_FRACTION:\s*\$\{\{ inputs\.rollout_fraction \}\}/);
  assert.match(promote, /VERSION_CODE:\s*\$\{\{ inputs\.version_code \}\}/);
  assert.match(promote, /--from-track="\$PROMOTE_FROM_TRACK"/);
  assert.match(promote, /--user-fraction="\$PLAY_USER_FRACTION"/);
  assert.match(promote, /--version-code="\$VERSION_CODE"/);
});

test('production summary uses environment values and no direct string interpolation', () => {
  const summary = step('Publish summary');
  for (const [key, input] of [
    ['VERSION_NAME', 'version_name'],
    ['VERSION_CODE', 'version_code'],
    ['PROMOTE_FROM_TRACK', 'promote_from_track'],
    ['PLAY_USER_FRACTION', 'rollout_fraction'],
  ]) {
    assert.ok(summary.includes(`${key}: \${{ inputs.${input} }}`));
  }
  assert.match(summary, /if \[ -z "\$PROMOTE_FROM_TRACK" \]/);
  assert.match(summary, /echo "- Version name: \$VERSION_NAME"/);
  assert.match(summary, /echo "- Rollout fraction: \$PLAY_USER_FRACTION"/);
});


test('internal preflight summary safely passes input and Play output through environment', () => {
  const preflight = fs.readFileSync(new URL('../.github/workflows/android-internal-preflight.yml', import.meta.url), 'utf8');
  const beginning = preflight.indexOf('      - name: Publish preflight summary\n');
  assert.ok(beginning > 0);
  const end = preflight.indexOf('\n      - name:', beginning + 1);
  const summary = preflight.slice(beginning, end < 0 ? undefined : end);
  assert.match(summary, /PREFLIGHT_VERSION_CODE:\s*\$\{\{ inputs\.version_code \}\}/);
  assert.match(summary, /PLAY_MAX_VERSION_CODE:\s*\$\{\{ steps\.play_access\.outputs\.max_version_code \}\}/);
  assert.match(summary, /PLAY_NEXT_VERSION_CODE:\s*\$\{\{ steps\.play_access\.outputs\.recommended_version_code \}\}/);
  assert.match(summary, /android-signed-apk-\$PREFLIGHT_VERSION_CODE/);
  assert.doesNotMatch(summary.slice(summary.indexOf('        run:')), /\$\{\{/);

  const lines = preflight.split(/\r?\n/);
  let runIndent = null;
  for (const line of lines) {
    const indent = line.match(/^\s*/)[0].length;
    if (/^\s*run:\s*(?:\||>-?)?\s*$/.test(line)) {
      runIndent = indent;
      continue;
    }
    if (runIndent !== null && line.trim() && indent <= runIndent) runIndent = null;
    if (runIndent !== null) {
      assert.doesNotMatch(line, /\$\{\{\s*inputs\./, `Unsafe preflight input: ${line.trim()}`);
    }
  }
});


test('production new-bundle publication checks Play global version availability before building', () => {
  const readback = step('Verify Google Play version code for new bundle');
  const validate = step('Ensure new bundle has an unused Play version code');
  const before = workflow.indexOf('      - name: Prepare Play and signing assets');
  const readbackIndex = workflow.indexOf('      - name: Verify Google Play version code for new bundle');
  const validateIndex = workflow.indexOf('      - name: Ensure new bundle has an unused Play version code');
  const buildIndex = workflow.indexOf('      - name: Build signed release bundle');
  const publishIndex = workflow.indexOf('      - name: Publish new production rollout');
  assert.ok(before < readbackIndex && readbackIndex < validateIndex);
  assert.ok(validateIndex < buildIndex && buildIndex < publishIndex);
  for (const block of [readback, validate]) {
    assert.match(block, /if:\s*\$\{\{ inputs\.promote_from_track == '' \}\}/);
  }
  assert.match(readback, /id: play_access/);
  assert.match(readback, /PLAY_SERVICE_ACCOUNT_JSON_PATH:\s*\$\{\{ runner\.temp \}\}\/play-service-account\.json/);
  assert.match(readback, /run: node \.\.\/scripts\/check-play-release-access\.mjs/);
  assert.match(validate, /REQUIRED_VERSION_CODE:\s*\$\{\{ steps\.play_access\.outputs\.recommended_version_code \}\}/);
  assert.match(validate, /assertRequestedVersionCode/);
});

test('production release dispatch validates version code, name, stage and source track before credentials', () => {
  const validation = step('Validate manual production release inputs');
  assert.ok(workflow.indexOf('Validate manual production release inputs') < workflow.indexOf('Download Doppler secrets'));
  for (const field of ['REQUESTED_VERSION_CODE', 'REQUESTED_VERSION_NAME', 'REQUESTED_SOURCE_TRACK', 'REQUESTED_ROLLOUT_FRACTION']) {
    assert.ok(validation.includes(`${field}:`));
  }
  const runText = validation.split('        run: |\n')[1]
    .split('\n')
    .filter((line) => line.startsWith('          '))
    .map((line) => line.slice(10))
    .join('\n');
  assert.match(runText, /assertRequestedVersionCode/);

  const run = (patch) => spawnSync('bash', ['-e', '-c', runText], {
    cwd: new URL('../Astroloji/', import.meta.url),
    encoding: 'utf8',
    timeout: 5000,
    env: {
      ...process.env,
      REQUESTED_VERSION_CODE: '1108',
      REQUESTED_VERSION_NAME: '1.0.1108',
      REQUESTED_SOURCE_TRACK: 'internal',
      REQUESTED_ROLLOUT_FRACTION: '0.1',
      PLAY_TRACK_PRODUCTION: 'production',
      ...patch,
    },
  });
  assert.equal(run({}).status, 0);
  for (const patch of [
    { REQUESTED_VERSION_CODE: '1108$(printf bad)' },
    { REQUESTED_VERSION_CODE: '0' },
    { PLAY_TRACK_PRODUCTION: '' },
    { PLAY_TRACK_PRODUCTION: 'internal' },
    { REQUESTED_VERSION_CODE: '2100000001' },
    { REQUESTED_VERSION_NAME: 'bad\nvalue' },
    { REQUESTED_SOURCE_TRACK: 'production' },
    { REQUESTED_SOURCE_TRACK: 'PRODUCTION' },
    { REQUESTED_SOURCE_TRACK: 'internal$(printf bad)' },
    { REQUESTED_ROLLOUT_FRACTION: '0' },
    { REQUESTED_ROLLOUT_FRACTION: '1' },
    { REQUESTED_ROLLOUT_FRACTION: '0.1$(printf bad)' },
  ]) {
    const result = run(patch);
    assert.equal(result.status, 1, `Expected fail-closed for ${JSON.stringify(patch)}; stderr=${result.stderr}`);
  }
});

test('fresh Play maximum version rejects stale new AAB code and accepts next code', () => {
  const block = step('Ensure new bundle has an unused Play version code');
  const runText = block.split('        run: |\n')[1]
    .split('\n')
    .filter((line) => line.startsWith('          '))
    .map((line) => line.slice(10))
    .join('\n');
  const run = (requested, required) => spawnSync('bash', ['-e', '-c', runText], {
    cwd: new URL('../Astroloji/', import.meta.url),
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, REQUESTED_VERSION_CODE: requested, REQUIRED_VERSION_CODE: required },
  });
  assert.equal(run('1108', '1108').status, 0);
  assert.equal(run('1107', '1108').status, 1);
  assert.equal(run('1108', '').status, 1);
});


test('new production bundle requires actual formatted non-sample AdMob IDs before Play mutation', () => {
  const gate = step('Verify production AdMob IDs for new bundle');
  assert.match(gate, /if:\s*\$\{\{ inputs\.promote_from_track == '' \}\}/);
  const position = workflow.indexOf('      - name: Verify production AdMob IDs for new bundle');
  assert.ok(position > workflow.indexOf('      - name: Prepare Play and signing assets'));
  assert.ok(position < workflow.indexOf('      - name: Build signed release bundle'));
  assert.ok(position < workflow.indexOf('      - name: Verify Google Play version code for new bundle'));

  const text = gate.split('        run: |\n')[1]
    .split('\n')
    .filter((line) => line.startsWith('          '))
    .map((line) => line.slice(10))
    .join('\n');

  const keys = [
    'ADMOB_APP_ID', 'ADMOB_BANNER_ID', 'ADMOB_INTERSTITIAL_ID',
    'ADMOB_REWARDED_ID', 'ADMOB_REWARDED_INTERSTITIAL_ID',
    'ADMOB_APP_OPEN_ID', 'ADMOB_NATIVE_ADVANCED_ID',
  ];
  const ids = {
    ADMOB_APP_ID: 'ca-app-pub-1234567890123456~3347511713',
    ADMOB_BANNER_ID: 'ca-app-pub-1234567890123456/9214589741',
    ADMOB_INTERSTITIAL_ID: 'ca-app-pub-1234567890123456/1033173712',
    ADMOB_REWARDED_ID: 'ca-app-pub-1234567890123456/5224354917',
    ADMOB_REWARDED_INTERSTITIAL_ID: 'ca-app-pub-1234567890123456/5354046379',
    ADMOB_APP_OPEN_ID: 'ca-app-pub-1234567890123456/9257395921',
    ADMOB_NATIVE_ADVANCED_ID: 'ca-app-pub-1234567890123456/2247696110',
  };

  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-production-ids-'));
  try {
    const run = (entries) => {
      fs.writeFileSync(path.join(folder, 'gradle.properties'),
        Object.entries(entries).map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
      return spawnSync('bash', ['-e', '-c', text], {
        cwd: folder, encoding: 'utf8', timeout: 5000,
      });
    };
    assert.equal(run(ids).status, 0);
    for (const key of keys) {
      const missing = { ...ids };
      delete missing[key];
      assert.equal(run(missing).status, 1, `${key} must be required`);
    }
    assert.equal(run({ ...ids, ADMOB_APP_ID: 'ca-app-pub-3940256099942544~3347511713' }).status, 1);
    assert.equal(run({ ...ids, ADMOB_REWARDED_ID: 'ca-app-pub-3940256099942544/5224354917' }).status, 1);
    assert.equal(run({ ...ids, ADMOB_BANNER_ID: 'not-an-id' }).status, 1);
    assert.equal(run({ ...ids, ADMOB_BANNER_ID: 'ca-app-pub-9876543210987654/9214589741' }).status, 1, 'Mismatched ad-unit publisher must fail closed');
    assert.equal(run({ ...ids, ADMOB_NATIVE_ADVANCED_ID: ids.ADMOB_REWARDED_ID }).status, 1, 'Duplicate unit across ad formats must fail closed');
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
