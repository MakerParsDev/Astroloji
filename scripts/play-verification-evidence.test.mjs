import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const evidence = fs.readFileSync('docs/verification/global-play-store-optimization-2026-08-07.md', 'utf8');

test('verification evidence contains no full email address and records canonical PR ownership', () => {
  assert.doesNotMatch(evidence, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.match(evidence, /MakerParsDev\/Astroloji/);
  assert.match(evidence, /PR #56|pull\/56/);
  assert.doesNotMatch(evidence, /oaslananka/i);
});
