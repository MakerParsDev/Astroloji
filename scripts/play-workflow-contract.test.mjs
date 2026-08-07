import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/android-metadata.yml', 'utf8');

function jobBlock(name, nextName) {
  const start = workflow.indexOf(`  ${name}:`);
  assert.ok(start >= 0, `Missing workflow job: ${name}`);
  const end = nextName ? workflow.indexOf(`  ${nextName}:`, start + 1) : workflow.length;
  return workflow.slice(start, end >= 0 ? end : workflow.length);
}

test('workflow exposes explicit validate, backup, diff, publish, cleanup, readback, and restore modes', () => {
  for (const mode of ['validate', 'backup', 'diff', 'publish', 'cleanup', 'readback', 'restore']) {
    assert.match(workflow, new RegExp(`- ${mode}(?:\\n|\\r\\n)`));
  }
  for (const input of [
    'backup_run_id',
    'backup_sha256',
    'state_digest',
    'removal_count',
    'confirmation',
  ]) {
    assert.match(workflow, new RegExp(`^      ${input}:`, 'm'));
  }
});

test('read-only modes do not require the metadata publication gate', () => {
  const block = jobBlock('play-readonly', 'reject-invalid-mutation');
  assert.match(block, /inputs\.mode == 'backup'/);
  assert.match(block, /inputs\.mode == 'diff'/);
  assert.match(block, /inputs\.mode == 'readback'/);
  assert.doesNotMatch(block, /ENABLE_METADATA_PUBLISH/);
  assert.doesNotMatch(block, /environment:\s*production/);
});

test('mutating modes require main, production environment, repository identity, and gate', () => {
  const block = jobBlock('play-mutation', 'verify-metadata-gate-closed');
  assert.match(block, /inputs\.mode == 'publish'/);
  assert.match(block, /inputs\.mode == 'cleanup'/);
  assert.match(block, /inputs\.mode == 'restore'/);
  assert.match(block, /github\.ref == 'refs\/heads\/main'/);
  assert.match(block, /github\.repository == 'MakerParsDev\/Astroloji'/);
  assert.match(block, /vars\.ENABLE_METADATA_PUBLISH == 'true'/);
  assert.match(block, /environment:\s*production/);
});

test('workflow backs up and downloads private operation artifacts with bounded retention', () => {
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /play-metadata-backup-\$\{\{ github\.run_id \}\}/);
  assert.match(workflow, /retention-days:\s*3/);
  assert.match(workflow, /actions\/download-artifact@v4/);
  assert.match(workflow, /run-id:\s*\$\{\{ inputs\.backup_run_id \}\}/);
  assert.match(workflow, /backup_sha256/);
  assert.match(workflow, /sha256sum/);
});

test('workflow dispatches every guarded script and passes exact confirmations', () => {
  for (const script of [
    'backup-play-metadata.mjs',
    'diff-play-metadata.mjs',
    'publish-play-metadata.mjs',
    'cleanup-play-locales.mjs',
    'readback-play-metadata.mjs',
    'restore-play-metadata.mjs',
  ]) {
    assert.match(workflow, new RegExp(script.replaceAll('.', '\\.')));
  }
  assert.match(workflow, /CONFIRMATION:\s*\$\{\{ inputs\.confirmation \}\}/);
  assert.match(workflow, /STATE_DIGEST:\s*\$\{\{ inputs\.state_digest \}\}/);
  assert.match(workflow, /REMOVAL_COUNT:\s*\$\{\{ inputs\.removal_count \}\}/);
  assert.match(workflow, /--confirmation "\$CONFIRMATION"/);
  assert.match(workflow, /--state-digest "\$STATE_DIGEST"/);
  assert.match(workflow, /--removal-count "\$REMOVAL_COUNT"/);
});


test('workflow run scripts never interpolate workflow_dispatch inputs directly', () => {
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
      assert.doesNotMatch(line, /\$\{\{\s*inputs\./, `Unsafe direct input interpolation in run block: ${line.trim()}`);
    }
  }
});

test('credential files are mode 0600 and removed in always cleanup steps', () => {
  assert.match(workflow, /chmod 600 "\$RUNNER_TEMP\/play-service-account\.json"/);
  const cleanupMatches = workflow.match(/if:\s*always\(\)[\s\S]{0,500}rm -f[\s\S]{0,250}play-service-account\.json/g) ?? [];
  assert.ok(cleanupMatches.length >= 2, `Expected credential cleanup in both Play jobs, found ${cleanupMatches.length}`);
});

test('final job dynamically verifies the repository gate returned to false with a dedicated read token', () => {
  const block = jobBlock('verify-metadata-gate-closed');
  assert.match(block, /GH_TOKEN:\s*\$\{\{ secrets\.METADATA_VARIABLES_READ_TOKEN \}\}/);
  assert.match(block, /METADATA_VARIABLES_READ_TOKEN is required/i);
  assert.match(block, /gh api\s+\\?\s*repos\/\$\{\{ github\.repository \}\}\/actions\/variables\/ENABLE_METADATA_PUBLISH/);
  assert.match(block, /current_value.*false/);
  assert.match(block, /ENABLE_METADATA_PUBLISH=false/);
  assert.match(block, /\$GITHUB_STEP_SUMMARY/);
});

test('workflow does not defer Play review by default', () => {
  assert.doesNotMatch(workflow, /PLAY_CHANGES_NOT_SENT_FOR_REVIEW:\s*['"]?true['"]?/);
});


test('metadata workflow installs a pinned checksum-verified Doppler CLI without exposing the token', () => {
  const installSteps = [...workflow.matchAll(/- name: Install pinned Doppler CLI[\s\S]*?(?=\n      - name:)/g)].map((match) => match[0]);
  assert.equal(installSteps.length, 2);
  for (const step of installSteps) {
    assert.match(step, /DOPPLER_VERSION:\s*3\.76\.1/);
    assert.match(step, /DOPPLER_SHA256:\s*e35230bd21fdbd7e41ddcb24672ec61cecefdb22de244d0216ea6b59853f63f2/);
    assert.match(step, /github\.com\/DopplerHQ\/cli\/releases\/download/);
    assert.match(step, /sha256sum --check/);
    assert.doesNotMatch(step, /DOPPLER_TOKEN/);
  }
});


test('workflow verifies approved backup against fresh live Play state immediately before publication', () => {
  const block = jobBlock('play-mutation', 'verify-metadata-gate-closed');
  assert.match(block, /Verify approved backup still matches live Play state/);
  assert.match(block, /verify-play-backup-current\.mjs/);
  const verifyIndex = block.indexOf('verify-play-backup-current.mjs');
  const publishIndex = block.indexOf('publish-play-metadata.mjs');
  assert.ok(verifyIndex >= 0 && publishIndex > verifyIndex, 'Fresh live-state verification must run before publication.');
});
