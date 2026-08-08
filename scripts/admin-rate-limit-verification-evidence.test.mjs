import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const evidencePath = new URL('../docs/verification/atomic-rate-limiting-admin-least-privilege-2026-08-08.md', import.meta.url);

const requiredBooleans = [
  'lifecycleFloorReady=true',
  'fourScopedRowsIsolated=true',
  'sourceFreeRotationPassed=true',
  'auditAllowlistPassed=true',
  'strictConcurrencyMatched=true',
  'transitionSharesMainLimiter=true',
  'legacyRuntimeRejected=true',
  'scopedRevocationIsolated=true',
  'scopedRevocationRestored=true',
  'legacyWorkerSecretAbsent=true',
  'legacyGitHubSecretAbsent=true',
  'legacyDopplerSecretAbsent=true',
  'scopedWorkerSecretsReady=true',
  'genericRedeployDidNotRecreateLegacy=true',
  'releaseGateRemainedFalse=true'
];

test('issue #7 evidence is complete and sanitized', () => {
  const text = readFileSync(evidencePath, 'utf8');
  for (const marker of requiredBooleans) assert.match(text, new RegExp(`^${marker}$`, 'm'));

  assert.doesNotMatch(text, /x-admin-secret/i);
  assert.doesNotMatch(text, /\bADMIN(?:_[A-Z]+)*_SECRET\s*=/);
  assert.doesNotMatch(text, /\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  assert.doesNotMatch(text, /(?:\b[0-9a-f]{1,4}:){2,}[0-9a-f:]*\b/i);
  assert.doesNotMatch(text, /ratelimit:|RateLimitBucket|Durable Object|bucket\s+id|object\s+id/i);
  assert.doesNotMatch(text, /LEGACY_REWARD_FORWARD_UNTIL|\bversion[_ ]id\b|\bworker version\b/i);
  assert.doesNotMatch(text, /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i);
  assert.doesNotMatch(text, /request[_ ]?id|synthetic (?:user|principal)|jwt\b/i);
  assert.doesNotMatch(text, /notification.*body|review.*body/i);
  assert.doesNotMatch(text, /\b(?:limit|quota|window)\s*[=:]\s*\d+/i);
  assert.doesNotMatch(text, /\d+\s+requests?\s+(?:per|\/)/i);
});
