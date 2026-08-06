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
