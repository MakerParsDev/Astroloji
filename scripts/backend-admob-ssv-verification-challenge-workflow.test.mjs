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

  assert.match(workflow, /command:[\s\S]*options:[\s\S]*- create[\s\S]*- inspect[\s\S]*- delete/);
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

test('create inspect and delete call only the hardened backend commands in safe order', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /npm run(?: --silent)? transition:challenge:create/);
  assert.match(workflow, /npm run(?: --silent)? transition:challenge:inspect/);
  assert.match(workflow, /npm run(?: --silent)? transition:challenge:delete/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /::add-mask::\$CLOUDFLARE_API_TOKEN/);

  ordered(workflow, [
    'Validate and mask challenge secrets',
    'Install backend dependencies',
    'Load and mask Cloudflare API token',
    'Create verification challenge',
    'Publish redacted evidence'
  ]);
});

test('delete validates its narrow admin token before D1 deletion and removes exact secrets afterward', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /ADMOB_SSV_SECRET_ADMIN_TOKEN: \$\{\{ secrets\.ADMOB_SSV_SECRET_ADMIN_TOKEN \}\}/);
  assert.match(workflow, /::add-mask::\$ADMOB_SSV_SECRET_ADMIN_TOKEN/);
  assert.equal((workflow.match(/gh secret delete ADMOB_SSV_TEST_USER_ID/g) ?? []).length, 1);
  assert.equal((workflow.match(/gh secret delete ADMOB_SSV_TEST_CUSTOM_DATA/g) ?? []).length, 1);

  ordered(workflow, [
    'Validate repository-secret cleanup token',
    'Delete verification challenge from D1',
    'Delete temporary repository secrets'
  ]);
  assert.match(workflow, /GH_TOKEN: \$\{\{ secrets\.ADMOB_SSV_SECRET_ADMIN_TOKEN \}\}/);
  assert.doesNotMatch(workflow, /^\s{4}ADMOB_SSV_SECRET_ADMIN_TOKEN:/m);
});
