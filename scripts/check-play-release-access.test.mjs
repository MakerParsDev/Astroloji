import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectVersionCodes,
  formatGoogleOAuthError,
  parseJsonObject,
  summarizeVersionCodes,
} from './check-play-release-access.mjs';

test('collectVersionCodes merges tracks, bundles, and APKs without duplicates', () => {
  assert.deepEqual(
    collectVersionCodes({
      tracks: [{ releases: [{ versionCodes: ['7', '9'] }, { versionCodes: ['11'] }] }],
      bundles: [{ versionCode: 9 }, { versionCode: 12 }],
      apks: [{ versionCode: 3 }, { versionCode: '12' }],
    }),
    [3, 7, 9, 11, 12],
  );
});

test('summarizeVersionCodes recommends one greater than the highest code', () => {
  assert.deepEqual(
    summarizeVersionCodes({ bundles: [{ versionCode: 42 }] }),
    { maxVersionCode: 42, recommendedVersionCode: 43, versionCodes: [42] },
  );
});

test('summarizeVersionCodes starts at one for a new Play app', () => {
  assert.deepEqual(
    summarizeVersionCodes(),
    { maxVersionCode: 0, recommendedVersionCode: 1, versionCodes: [] },
  );
});

test('summarizeVersionCodes rejects exhausted Play version codes', () => {
  assert.throws(
    () => summarizeVersionCodes({ bundles: [{ versionCode: 2_100_000_000 }] }),
    /No valid Google Play version code remains/,
  );
});


test('formatGoogleOAuthError exposes safe Google error details', () => {
  assert.equal(
    formatGoogleOAuthError(400, {
      error: 'invalid_grant',
      error_description: 'Invalid JWT Signature.',
    }),
    'Google OAuth token request failed (400): invalid_grant - Invalid JWT Signature.',
  );
});

test('formatGoogleOAuthError redacts token-like values and control characters', () => {
  const message = formatGoogleOAuthError(400, {
    error: 'invalid_grant',
    error_description: 'bad\nsecret abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
  });

  assert.doesNotMatch(message, /abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG/);
  assert.match(message, /\[redacted\]/);
  assert.doesNotMatch(message, /\n/);
});


test('formatGoogleOAuthError accepts null bodies', () => {
  assert.equal(
    formatGoogleOAuthError(400, null),
    'Google OAuth token request failed (400): unknown_error.',
  );
});

test('parseJsonObject accepts objects and rejects null, arrays, primitives, and malformed JSON', () => {
  assert.deepEqual(parseJsonObject('{"error":"invalid_grant"}'), { error: 'invalid_grant' });
  assert.deepEqual(parseJsonObject('null'), {});
  assert.deepEqual(parseJsonObject('[]'), {});
  assert.deepEqual(parseJsonObject('"text"'), {});
  assert.deepEqual(parseJsonObject('{'), {});
  assert.deepEqual(parseJsonObject(''), {});
});
