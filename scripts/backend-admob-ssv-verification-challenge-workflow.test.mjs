import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflowPath = '.github/workflows/backend-admob-ssv-verification-challenge.yml';

function ordered(content, tokens) {
  const positions = tokens.map((token) => content.indexOf(token));
  assert.ok(positions.every((position) => position >= 0), `Missing ordered token: ${tokens[positions.indexOf(-1)]}`);
  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(positions[index - 1] < positions[index], `${tokens[index - 1]} must precede ${tokens[index]}`);
  }
}

test('challenge workflow is main-only, production-gated, and minimally permissioned', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /command:[\s\S]*options:[\s\S]*- create[\s\S]*- inspect[\s\S]*- delete[\s\S]*- callback/);
  assert.match(workflow, /MANAGE_ADMOB_SSV_CHALLENGE/);
  assert.match(workflow, /github\.repository == 'MakerParsDev\/Astroloji'/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /ENABLE_PRODUCTION_RELEASE/);
  assert.match(workflow, /must remain false/);
  assert.match(workflow, /persist-credentials: false/);
});

test('challenge values are masked, validated, and never persisted or summarized in full', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /ADMOB_SSV_TEST_USER_ID: \$\{\{ secrets\.ADMOB_SSV_TEST_USER_ID \}\}/);
  assert.match(workflow, /ADMOB_SSV_TEST_CUSTOM_DATA: \$\{\{ secrets\.ADMOB_SSV_TEST_CUSTOM_DATA \}\}/);
  assert.match(workflow, /::add-mask::\$ADMOB_SSV_TEST_USER_ID/);
  assert.match(workflow, /::add-mask::\$ADMOB_SSV_TEST_CUSTOM_DATA/);
  assert.doesNotMatch(workflow, /GITHUB_ENV[^\n]*(ADMOB_SSV_TEST_USER_ID|ADMOB_SSV_TEST_CUSTOM_DATA)/);
  assert.doesNotMatch(workflow, /echo\s+"?\$ADMOB_SSV_TEST_(USER_ID|CUSTOM_DATA)"?/);
  assert.doesNotMatch(workflow, /echo[^\n]*(User ID|Custom data)[^\n]*\$ADMOB_SSV_TEST_/i);
  assert.match(workflow, /redacted evidence/i);
});

test('challenge and callback operations expose only hardened backend commands', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /npm run(?: --silent)? transition:challenge:create/);
  assert.match(workflow, /npm run(?: --silent)? transition:challenge:inspect/);
  assert.match(workflow, /npm run(?: --silent)? transition:challenge:delete/);
  assert.match(workflow, /npm run(?: --silent)? transition:callback:inspect/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID/);
  assert.match(
    workflow,
    /if \[ "\$INPUT_COMMAND" = "callback" \] && \[ -z "\$\{CLOUDFLARE_ACCOUNT_ID:-\}" \]/
  );
  assert.doesNotMatch(workflow, /for name in DOPPLER_PROJECT DOPPLER_CONFIG CLOUDFLARE_ACCOUNT_ID/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /::add-mask::\$CLOUDFLARE_API_TOKEN/);

  ordered(workflow, [
    'Validate and mask challenge secrets',
    'Install backend dependencies',
    'Install pinned Doppler CLI',
    'Create verification challenge',
    'Publish redacted evidence'
  ]);
});

test('delete receives both supplied identifiers for challenge and temporary-user cleanup', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const deleteStart = workflow.indexOf('Delete verification challenge from D1');
  const deleteEnd = workflow.indexOf('Publish redacted evidence');
  assert.ok(deleteStart >= 0 && deleteEnd > deleteStart);
  const deleteBlock = workflow.slice(deleteStart, deleteEnd);

  assert.match(
    workflow,
    /\[ "\$INPUT_COMMAND" = "create" \] \|\| \[ "\$INPUT_COMMAND" = "delete" \]/
  );
  assert.match(deleteBlock, /ADMOB_SSV_TEST_USER_ID: \$\{\{ secrets\.ADMOB_SSV_TEST_USER_ID \}\}/);
  assert.match(deleteBlock, /ADMOB_SSV_TEST_CUSTOM_DATA: \$\{\{ secrets\.ADMOB_SSV_TEST_CUSTOM_DATA \}\}/);
});

test('delete removes only the D1 challenge and requires manual temporary-secret cleanup', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.doesNotMatch(workflow, /ADMOB_SSV_SECRET_ADMIN_TOKEN/);
  assert.doesNotMatch(workflow, /gh secret delete/);
  assert.doesNotMatch(workflow, /GH_TOKEN:/);
  assert.match(workflow, /Delete these temporary repository secrets manually/);
  assert.match(workflow, /ADMOB_SSV_TEST_USER_ID/);
  assert.match(workflow, /ADMOB_SSV_TEST_CUSTOM_DATA/);

  ordered(workflow, [
    'Delete verification challenge from D1',
    'Publish redacted evidence'
  ]);
});


test('workflow pins external tooling and scopes deployment credentials to execution steps', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803/);
  assert.match(workflow, /actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38/);
  assert.match(workflow, /DOPPLER_VERSION: 3\.76\.1/);
  assert.match(workflow, /DOPPLER_SHA256: e35230bd21fdbd7e41ddcb24672ec61cecefdb22de244d0216ea6b59853f63f2/);
  assert.match(workflow, /sha256sum --check/);
  assert.doesNotMatch(workflow, /cli\.doppler\.com\/install\.sh/);
  assert.doesNotMatch(workflow, /^\s{6}DOPPLER_TOKEN:/m);
  assert.doesNotMatch(workflow, /CLOUDFLARE_API_TOKEN[\s\S]*GITHUB_ENV/);
  assert.equal((workflow.match(/DOPPLER_TOKEN: \$\{\{ secrets\.DOPPLER_TOKEN \}\}/g) ?? []).length, 4);
  assert.equal((workflow.match(/env -u DOPPLER_TOKEN CLOUDFLARE_API_TOKEN=/g) ?? []).length, 4);
});


test('callback inspection publishes only bounded redacted telemetry fields', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const callbackStart = workflow.indexOf('Inspect redacted SSV callback results');
  const callbackEnd = workflow.indexOf('Publish redacted evidence');
  assert.ok(callbackStart >= 0 && callbackEnd > callbackStart);
  const callbackBlock = workflow.slice(callbackStart, callbackEnd);

  assert.match(callbackBlock, /SSV_LOOKBACK_MINUTES: '360'/);
  assert.match(callbackBlock, /SSV_RESULT_LIMIT: '20'/);
  assert.match(callbackBlock, /transition:callback:inspect/);
  assert.match(workflow, /callback: \['operation', 'status', 'timestamp', 'scriptName', 'outcome', 'verifierCode', 'scriptVersion', 'telemetryCount', 'returnedCount', 'workerServiceSeen', 'queryStatus', 'rowsRead', 'scriptFilterReturnedCount', 'scriptFilterQueryStatus', 'scriptFilterRowsRead', 'unfilteredReturnedCount', 'unfilteredQueryStatus', 'unfilteredRowsRead'\]/);
  for (const forbidden of ['signature', 'requestId', 'userId', 'customData', 'url']) {
    assert.doesNotMatch(callbackBlock, new RegExp(`console\\.log[^\\n]*${forbidden}`, 'i'));
  }
});

test('implementation plan uses portable PowerShell-friendly verification commands', () => {
  const plan = fs.readFileSync(
    'docs/superpowers/plans/2026-07-27-secure-admob-verification-challenge-workflow.md',
    'utf8'
  );

  assert.doesNotMatch(plan, /PATH=\/opt\/node|PATH=\/home\//);
  assert.doesNotMatch(plan, /^cd \.\.$/m);
  assert.match(plan, /Push-Location backend/);
  assert.match(plan, /Pop-Location/);
});

const operatorDocs = [
  'backend/README.md',
  'docs/PLAY_PRODUCTION_READINESS.md',
  'RELEASE_RUNBOOK.md'
];

test('operator docs describe one offline-secret workflow without positional identifiers', () => {
  for (const path of operatorDocs) {
    const content = fs.readFileSync(path, 'utf8');
    for (const required of [
      'tools/admob-ssv-verification-values.html',
      'ADMOB_SSV_TEST_USER_ID',
      'ADMOB_SSV_TEST_CUSTOM_DATA',
      'MANAGE_ADMOB_SSV_CHALLENGE',
      'backend-admob-ssv-verification-challenge'
    ]) {
      assert.match(content, new RegExp(required), `${path} must mention ${required}`);
    }
    assert.doesNotMatch(content, /transition:challenge:create/);
    assert.doesNotMatch(content, /transition:challenge:inspect\s+--/);
    assert.doesNotMatch(content, /transition:challenge:delete\s+--/);
    assert.doesNotMatch(content, /<challenge-uuid>|<uuid>/);
    assert.match(content, /create -> AdMob -> inspect verified -> delete/);
    assert.doesNotMatch(content, /ADMOB_SSV_SECRET_ADMIN_TOKEN/);
    assert.match(content, /manuel/i);
    assert.match(content, /gecici D1 kullanic/i);
  }
});
