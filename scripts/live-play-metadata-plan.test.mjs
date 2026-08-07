import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const plan = fs.readFileSync('docs/superpowers/plans/2026-08-07-live-play-metadata-contract.md', 'utf8');

function section(startHeading, endHeading) {
  const start = plan.indexOf(startHeading);
  assert.ok(start >= 0, `Missing plan section ${startHeading}`);
  const end = endHeading ? plan.indexOf(endHeading, start + startHeading.length) : plan.length;
  return plan.slice(start, end >= 0 ? end : plan.length);
}

test('live metadata plan identifies Bash execution hosts for globbed commands', () => {
  assert.match(plan, /Execution host:[^\n]*(?:MSI Ubuntu|GitHub Ubuntu)[^\n]*Bash/i);
  assert.match(plan, /node --test scripts\/\*\.test\.mjs/);
});

test('fresh backup plan removes temporary credentials on every handled exit with host-specific cleanup', () => {
  const publication = section('### Task 3:', '### Task 4:');
  assert.match(publication, /mode-`0600`[^\n]*outside the repository/i);
  assert.match(publication, /Ubuntu[^\n]*(?:trap|rm -f)/i);
  assert.match(publication, /PowerShell[^\n]*(?:finally|Remove-Item)/i);
  assert.match(publication, /success[^\n]*failure[^\n]*timeout[^\n]*cancellation/i);
});

test('publication and cleanup use exact run-scoped expiring authorization and explicit closure', () => {
  for (const [name, block] of [
    ['publication', section('### Task 3:', '### Task 4:')],
    ['cleanup', section('### Task 4:', '### Task 5:')],
  ]) {
    assert.match(block, /METADATA_PUBLISH_AUTH_RUN_ID/, `${name} must name run authorization`);
    assert.match(block, /METADATA_PUBLISH_AUTH_EXPIRES_AT_EPOCH/, `${name} must name expiry`);
    assert.match(block, /(?:exact[^\n]*workflow run ID|workflow run ID[^\n]*exact)/i, `${name} must bind exact run`);
    assert.match(block, /(?:300 seconds|5 minutes)/i, `${name} must bound expiry`);
    assert.match(block, /METADATA_PUBLISH_AUTH_RUN_ID=disabled/, `${name} must explicitly clear run id`);
    assert.match(block, /METADATA_PUBLISH_AUTH_EXPIRES_AT_EPOCH=0/, `${name} must explicitly clear expiry`);
    assert.match(block, /ENABLE_METADATA_PUBLISH=false/, `${name} must keep legacy gate false`);
    assert.match(block, /dispatch failure[^\n]*job-start failure[^\n]*cancellation/i, `${name} must cover failure paths`);
  }
});
