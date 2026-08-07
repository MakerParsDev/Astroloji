import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const evidence = fs.readFileSync('docs/verification/global-play-store-optimization-2026-08-07.md', 'utf8');

test('verification evidence contains no full email address and records canonical PR ownership', () => {
  assert.doesNotMatch(evidence, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.match(evidence, /MakerParsDev\/Astroloji/);
  assert.match(evidence, /PR #56|pull\/56/);
  assert.match(evidence, /PR #57|pull\/57/);
  assert.match(evidence, /final verification tree:\s*cd1ce0a46b17187f4d745f52f21c0e69cf4ed3ab/i);
  assert.match(evidence, /verification tree parent:\s*164fb24ce01d8c3c303a9517aaec74f209e3ef06/i);
  assert.match(evidence, /base implementation ancestor:\s*955f6146d55bb0f3be0d666fad553cafcc73b57d/i);
  assert.match(evidence, /completed-rollout contract branch:\s*fix\/play-metadata-live-contract-20260807/i);
  assert.match(evidence, /completed-rollout implementation tree:\s*8d8759d59515815db4c47447f93e27c68f8fdca7/i);
  assert.match(evidence, /completed-rollout review-fix tree:\s*c0f962b10fc1a4a11235713a6ab9ec38abff5fe1/i);
  assert.match(evidence, /completed-rollout run-auth tree:\s*822eb7341cdb6b7cbcdf8d0b977e1fb3abf2b2de/i);
  assert.match(evidence, /completed-rollout design tree:\s*2ebb73d5040a83d911c673cb1e8948fed715375e/i);
  assert.doesNotMatch(evidence, /oaslananka/i);
});
