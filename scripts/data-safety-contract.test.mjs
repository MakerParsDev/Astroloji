import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const matrix = readFileSync(new URL('../docs/DATA_SAFETY_2026.md', import.meta.url), 'utf8');
const readiness = readFileSync(new URL('../docs/PLAY_PRODUCTION_READINESS.md', import.meta.url), 'utf8');

test('data safety matrix covers every active collection surface', () => {
  for (const required of [
    'Date of birth',
    'ephemeral',
    'Firebase Analytics',
    'Crashlytics',
    'Firebase installation ID',
    'legacy FCM registration token',
    'Google Play purchase token',
    'daily feedback category',
    'share link',
    'account deletion',
    'Google Mobile Ads',
  ]) {
    assert.match(matrix, new RegExp(required, 'i'), `Missing Data Safety entry: ${required}`);
  }
});

test('data safety matrix does not claim birth date stays on device', () => {
  assert.doesNotMatch(matrix, /birth date[^\n]*(?:never leaves|only on device)/i);
  assert.match(matrix, /transmitted[^\n]*personal guidance/i);
});

test('data safety source links to the canonical Play policy answer set', () => {
  assert.match(matrix, /PLAY_POLICY_ANSWER_SET_2026\.md/);
  assert.match(matrix, /Account deletion[^\n]*Supported/i);
});

test('production readiness requires public deletion verification and separates live rollout from the desired ten-percent contract', () => {
  assert.match(readiness, /public Play page[^\n]*account deletion[^\n]*supported/i);
  assert.match(readiness, /currently completed at 100%/i);
  assert.match(readiness, /10% cap[^\n]*separate rollout decision/i);
  assert.doesNotMatch(readiness, /existing production listing currently reports that data cannot be deleted/i);
});
