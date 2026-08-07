import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseRolloutFraction, selectRelevantRelease } from './lib/play-release.mjs';

test('release selection prefers the highest staged release over completed history', () => {
  const track = {
    releases: [
      { status: 'completed', versionCodes: ['1102'] },
      { status: 'inProgress', userFraction: 0.1, versionCodes: ['1103'] },
      { status: 'draft', versionCodes: ['9999'] },
    ],
  };
  assert.deepEqual(selectRelevantRelease(track).versionCodes, ['1103']);
  assert.equal(releaseRolloutFraction(track), 0.1);
});

test('release selection prefers halted staged release and highest version code', () => {
  const track = {
    releases: [
      { status: 'inProgress', userFraction: 0.1, versionCodes: ['1103'] },
      { status: 'halted', userFraction: 0.25, versionCodes: ['1104'] },
    ],
  };
  assert.deepEqual(selectRelevantRelease(track).versionCodes, ['1104']);
  assert.equal(releaseRolloutFraction(track), 0.25);
});

test('release selection falls back to highest completed release and ignores drafts', () => {
  const track = {
    releases: [
      { status: 'completed', versionCodes: ['1102'] },
      { status: 'draft', versionCodes: ['9999'] },
      { status: 'completed', versionCodes: ['1105'] },
    ],
  };
  assert.deepEqual(selectRelevantRelease(track).versionCodes, ['1105']);
  assert.equal(releaseRolloutFraction(track), 1);
});

test('release selection returns null when no staged or completed release exists', () => {
  assert.equal(selectRelevantRelease({ releases: [{ status: 'draft', versionCodes: ['1109'] }] }), null);
  assert.equal(releaseRolloutFraction({ releases: [] }), null);
});
