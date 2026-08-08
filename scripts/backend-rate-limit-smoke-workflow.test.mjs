import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/backend-rate-limit-smoke.yml', 'utf8');

test('rate-limit smoke is manual, main-only, production-gated, and Ubuntu-only', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /inputs\.confirm == 'VERIFY_RATE_LIMIT'/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /ENABLE_PRODUCTION_RELEASE/);
  assert.match(workflow, /test "\$ENABLE_PRODUCTION_RELEASE" = 'false'/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /GITHUB_SHA/);
});

test('smoke isolates one synthetic user and cleans it unconditionally', () => {
  assert.equal((workflow.match(/INSERT INTO users/g) ?? []).length, 1);
  assert.match(workflow, /is_premium[^\n]*0/);
  assert.match(workflow, /DELETE FROM users/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /syntheticPrincipalIsolated=true/);
  assert.match(workflow, /syntheticUserCleanupVerified=true/);
  assert.doesNotMatch(workflow, /INSERT INTO (fcm_tokens|subscriptions|reward|events)/i);
});

test('smoke loads only bounded verification credentials and publishes boolean evidence', () => {
  assert.match(workflow, /DOPPLER_VERSION: 3\.76\.1/);
  assert.match(workflow, /DOPPLER_SHA256: e35230bd21fdbd7e41ddcb24672ec61cecefdb22de244d0216ea6b59853f63f2/);
  assert.match(workflow, /sha256sum --check/);
  assert.doesNotMatch(workflow, /cli\.doppler\.com\/install\.sh/);
  assert.doesNotMatch(workflow, /^\s{6}DOPPLER_TOKEN:/m);
  assert.equal((workflow.match(/DOPPLER_TOKEN: \$\{\{ secrets\.DOPPLER_TOKEN \}\}/g) ?? []).length, 1);
  assert.match(workflow, /doppler secrets get JWT_SECRET/);
  assert.match(workflow, /doppler secrets get CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(workflow, /ADMIN_SECRET|ADMIN_CONTENT_SECRET|ADMIN_NOTIFICATION_SECRET|ADMIN_PLAY_READ_SECRET|ADMIN_PLAY_WRITE_SECRET/);
  assert.doesNotMatch(workflow, /GOOGLE_SERVICE_ACCOUNT_JSON|FIREBASE_SERVICE_ACCOUNT_JSON|purchase_token|customer.*JWT/i);
  assert.doesNotMatch(workflow, /users\/register|cf-connecting-ip/i);
  assert.match(workflow, /strictRateLimitMatched/);
  assert.match(workflow, /admittedRequestsHitValidation/);
  assert.match(workflow, /rejectedRequestsWereRateLimited/);
  assert.match(workflow, /retryAfterPresent/);
  assert.doesNotMatch(workflow, /cat .*\.json|head .*\.json|response body|allow.*count|reject.*count/i);
});

test('verifier keeps live policy details and sensitive diagnostics private', () => {
  const verifier = readFileSync('backend/scripts/verify-rate-limit-production.ts', 'utf8');
  assert.match(verifier, /PRODUCTION_BASE_URL = 'https:\/\/astrology\.parsfilo\.com'/);
  assert.match(verifier, /baseUrl !== PRODUCTION_BASE_URL/);
  assert.equal((verifier.match(/console\.log\(/g) ?? []).length, 1);
  assert.doesNotMatch(verifier, /console\.log\([^\n]*(token|userId|firebaseUid|bodyText|burstSize|limit|windowSeconds)/i);
  assert.equal((verifier.match(/console\.error\(/g) ?? []).length, 1);
  assert.match(verifier, /console\.error\('Rate limit production verification failed\.'\)/);
  assert.match(verifier, /strictRateLimitMatched/);
  assert.match(verifier, /syntheticPrincipalIsolated: true/);
});
