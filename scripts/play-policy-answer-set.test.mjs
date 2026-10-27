import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validatePolicyAnswerSet } from './lib/play-policy.mjs';
import { loadStoreConfig } from './lib/play-store-config.mjs';

const root = process.cwd();
const answerSet = fs.readFileSync('docs/PLAY_POLICY_ANSWER_SET_2026.md', 'utf8');
const matrix = fs.readFileSync('docs/DATA_SAFETY_2026.md', 'utf8');
const storeConfig = loadStoreConfig(root);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('operator answer set contains the exact supported policy answers', () => {
  const requiredAnswers = [
    'Account deletion: Supported',
    'Account deletion URL: https://astrology.parsfilo.com/delete-account',
    'Privacy policy: https://astrology.parsfilo.com/privacy',
    'Ads: Yes',
    'Purchases: Google Play subscriptions',
    'Data deletion request: Available in app',
    'Optional date of birth: Collected for app functionality',
  ];
  for (const answer of requiredAnswers) {
    assert.match(answerSet, new RegExp(escapeRegExp(answer), 'i'));
  }
  assert.doesNotMatch(answerSet, /data cannot be deleted/i);
});

test('real policy answer set is consistent with store config and engineering matrix', () => {
  assert.deepEqual(validatePolicyAnswerSet(answerSet, storeConfig, matrix), []);
});

test('operator references conservatively disclosed mood data and a current release hold', () => {
  assert.match(answerSet, /Health information: Optional mood check-ins/);
  assert.match(answerSet, /shared YES \(conservative published answers\)/);
  assert.match(answerSet, /1105\/1106 clients/);
  assert.match(answerSet, /support recipient with a synthetic test/);
  assert.match(answerSet, /NO-GO \/ HOLD/);
  assert.match(matrix, /Optional mood check-in/);
  assert.match(matrix, /mood_logs/);
  assert.match(matrix, /Health info: Collected YES \/ Shared YES/);
  assert.match(matrix, /old distributed 1105\/1106 SDK traffic/);
});

test('validator rejects support identity drift', () => {
  const drifted = answerSet.replace(storeConfig.support.email, 'wrong@example.com');
  const errors = validatePolicyAnswerSet(drifted, storeConfig, matrix);
  assert.ok(errors.some((error) => /support e-mail/i.test(error)));
});

test('validator rejects a claim that data cannot be deleted', () => {
  const errors = validatePolicyAnswerSet(`${answerSet}\nData cannot be deleted.`, storeConfig, matrix);
  assert.ok(errors.some((error) => /data cannot be deleted/i.test(error)));
});

test('validator requires every active provider', () => {
  const withoutCrashlytics = answerSet.replaceAll('Firebase Crashlytics', 'Removed Provider');
  const errors = validatePolicyAnswerSet(withoutCrashlytics, storeConfig, matrix);
  assert.ok(errors.some((error) => /Firebase Crashlytics/iu.test(error)));
});


test('validator rejects contradictory policy field values', () => {
  const contradictory = `${answerSet}\nAds: No\nNote: required answer example Ads: Yes`;
  const errors = validatePolicyAnswerSet(contradictory, storeConfig, matrix);
  assert.ok(errors.some((error) => /Ads.*conflict|conflicting.*Ads/i.test(error)));
});
