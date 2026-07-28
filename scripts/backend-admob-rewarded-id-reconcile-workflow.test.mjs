import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflowPath = '.github/workflows/backend-admob-rewarded-id-reconcile.yml';

function workflow() {
  return fs.readFileSync(workflowPath, 'utf8');
}

test('rewarded ID reconciliation is explicit, main-only, production-gated, and minimally permissioned', () => {
  const content = workflow();

  assert.match(content, /name: backend-admob-rewarded-id-reconcile/);
  assert.match(content, /RECONCILE_ADMOB_REWARDED_ID/);
  assert.match(content, /github\.repository == 'MakerParsDev\/Astroloji'/);
  assert.match(content, /github\.ref == 'refs\/heads\/main'/);
  assert.match(content, /environment: production/);
  assert.match(content, /permissions:\s*\n\s*contents: read/);
  assert.match(content, /cancel-in-progress: false/);
  assert.match(content, /ENABLE_PRODUCTION_RELEASE/);
  assert.match(content, /must remain false/);
  assert.match(content, /persist-credentials: false/);
});

test('workflow reconciles only the canonical rewarded unit and verifies the read-back value', () => {
  const content = workflow();

  assert.match(content, /EXPECTED_ADMOB_REWARDED_ID: ca-app-pub-3312485084079132\/6423931059/);
  assert.match(content, /doppler secrets get ADMOB_REWARDED_ID --plain/);
  assert.match(content, /::add-mask::\$current/);
  assert.match(content, /::add-mask::\$verified/);
  assert.match(content, /doppler secrets set ADMOB_REWARDED_ID/);
  assert.match(content, /--no-interactive/);
  assert.match(content, /--visibility masked/);
  assert.match(content, /--silent/);
  assert.match(content, /\[ "\$verified" = "\$EXPECTED_ADMOB_REWARDED_ID" \]/);
  assert.equal((content.match(/doppler secrets set/g) ?? []).length, 1);
  assert.doesNotMatch(content, /doppler secrets (delete|set) (JWT_SECRET|CLOUDFLARE_API_TOKEN)/);
});

test('Doppler credentials are step-scoped and tooling is checksum-pinned', () => {
  const content = workflow();

  assert.match(content, /DOPPLER_VERSION: 3\.76\.1/);
  assert.match(content, /DOPPLER_SHA256: e35230bd21fdbd7e41ddcb24672ec61cecefdb22de244d0216ea6b59853f63f2/);
  assert.match(content, /sha256sum --check/);
  assert.doesNotMatch(content, /cli\.doppler\.com\/install\.sh/);
  assert.doesNotMatch(content, /^\s{6}DOPPLER_TOKEN:/m);
  assert.equal((content.match(/DOPPLER_TOKEN: \$\{\{ secrets\.DOPPLER_TOKEN \}\}/g) ?? []).length, 1);
});

test('workflow publishes only bounded reconciliation evidence', () => {
  const content = workflow();

  assert.match(content, /Rewarded ID reconciliation/);
  assert.match(content, /Result:/);
  assert.deepEqual(content.match(/echo[^\n]*\$current[^\n]*/g) ?? [], ['echo \"::add-mask::$current\"']);
  assert.deepEqual(content.match(/echo[^\n]*\$verified[^\n]*/g) ?? [], ['echo \"::add-mask::$verified\"']);
  assert.doesNotMatch(content, /GITHUB_STEP_SUMMARY[^\n]*(current|verified)/i);
});
