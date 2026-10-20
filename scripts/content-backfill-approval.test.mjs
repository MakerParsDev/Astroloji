import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/content-backfill.yml', 'utf8');

test('content backfill workflow sends explicit bounded approval metadata', () => {
  assert.match(workflow, /SEED_APPROVED_BY:/);
  assert.match(workflow, /SEED_APPROVAL_REFERENCE:/);
  assert.match(workflow, /editorial_status[^\n]*approved/);
  assert.match(workflow, /approved_by/);
  assert.match(workflow, /approval_reference/);
  assert.doesNotMatch(workflow, /approved_by[^\n]*(ADMIN_SECRET|DOPPLER_TOKEN)/);
});

test('content backfill uses only the content-ops protected credential', () => {
  assert.match(workflow, /environment: production-admin-content/);
  assert.match(workflow, /ADMIN_CONTENT_SECRET: \$\{\{ secrets\.ADMIN_CONTENT_SECRET \}\}/);
  assert.match(workflow, /x-admin-secret: \$ADMIN_CONTENT_SECRET/);
  assert.doesNotMatch(workflow, /ADMIN_SECRET|DOPPLER_TOKEN|DOPPLER_PROJECT|DOPPLER_CONFIG/);
  assert.doesNotMatch(workflow, /doppler secrets get|Install Doppler CLI|Load admin secret from Doppler/);
});

test('bounded product recovery never requests metered AI or static rewrites', () => {
  assert.match(workflow, /enhance_with_ai': False/);
  assert.match(workflow, /skip_existing': True/);
  assert.match(workflow, /skip_static_content': True/);
  assert.match(workflow, /SEED_CURRENT_LOCALE/);
  assert.match(workflow, /SEED_DAILY_DAYS/);
  assert.match(workflow, /languages="tr en es pt de fr"/);
  assert.match(workflow, /ENABLE_CONTENT_BACKFILL == 'true'/);
  assert.doesNotMatch(workflow, /SEED_SKIP_STATIC_CONTENT:/);
});

test('workflow fails closed against the old production Worker before any content write', () => {
  const gateIndex = workflow.indexOf('Verify backend has deterministic and idempotent backfill support');
  const mutationIndex = workflow.indexOf('Recover bounded product content without metered AI');
  assert.ok(gateIndex > 0 && mutationIndex > gateIndex);
  assert.match(workflow, /admin\/content\/backfill\/capabilities/);
  assert.match(workflow, /deterministic_default/);
  assert.match(workflow, /skip_existing_supported/);
});
