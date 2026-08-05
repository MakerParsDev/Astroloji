import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const matrix = readFileSync(new URL('../docs/DATA_SAFETY_2026.md', import.meta.url), 'utf8');

test('data safety matrix covers every active collection surface', () => {
  for (const required of [
    'Date of birth',
    'ephemeral',
    'Firebase Analytics',
    'Crashlytics',
    'FCM token',
    'Google Play purchase token',
    'daily feedback category',
    'share link',
    'account deletion',
    'Google Mobile Ads'
  ]) {
    assert.match(matrix, new RegExp(required, 'i'), `Missing Data Safety entry: ${required}`);
  }
});

test('data safety matrix does not claim birth date stays on device', () => {
  assert.doesNotMatch(matrix, /birth date[^\n]*(?:never leaves|only on device)/i);
  assert.match(matrix, /transmitted[^\n]*personal guidance/i);
});
