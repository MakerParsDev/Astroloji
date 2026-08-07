import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const plan = fs.readFileSync('docs/superpowers/plans/2026-08-07-live-play-metadata-contract.md', 'utf8');

test('live metadata plan identifies Bash execution hosts for globbed commands', () => {
  assert.match(plan, /Execution host:[^\n]*(?:MSI Ubuntu|GitHub Ubuntu)[^\n]*Bash/i);
  assert.match(plan, /node --test scripts\/\*\.test\.mjs/);
});

test('live metadata plan resets the publication gate unconditionally for both mutations', () => {
  assert.match(plan, /publication[^\n]*gate reset[^\n]*(?:trap|finally)[^\n]*unconditional/i);
  assert.match(plan, /cleanup[^\n]*gate reset[^\n]*(?:trap|finally)[^\n]*unconditional/i);
  assert.match(plan, /dispatch failure[^\n]*job-start failure[^\n]*cancellation/i);
});
