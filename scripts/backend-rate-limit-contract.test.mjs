import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runtimeFiles = [
  'backend/src/services/rateLimit.ts',
  'backend/src/index.ts',
  'backend/src/workers/user.ts',
  'backend/src/workers/reward.ts',
  'backend/src/workers/subscription.ts'
];

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('runtime rate limiting has no KV compatibility path', () => {
  const source = runtimeFiles.map(read).join('\n');
  assert.doesNotMatch(source, /enforceKvRateLimit/);
  assert.doesNotMatch(source, /ratelimit:/);
});

test('transition worker shares the main RateLimitBucket namespace', () => {
  const config = read('backend/wrangler.transition.toml');
  const bindingBlocks = config
    .split('[[durable_objects.bindings]]')
    .slice(1)
    .map((section) => section.split(/\n\[\[/, 1)[0]);
  const rateLimiterBinding = bindingBlocks.find((block) => /(?:^|\n)name\s*=\s*"RATE_LIMITER"(?:\n|$)/.test(block));
  assert.ok(rateLimiterBinding, 'RATE_LIMITER durable object binding must exist.');
  assert.match(rateLimiterBinding, /(?:^|\n)class_name\s*=\s*"RateLimitBucket"(?:\n|$)/);
  assert.match(rateLimiterBinding, /(?:^|\n)script_name\s*=\s*"astrology-backend"(?:\n|$)/);
  assert.doesNotMatch(config, /\[exports\.RateLimitBucket\]/);

  const transitionSource = read('backend/src/transition/index.ts');
  assert.doesNotMatch(transitionSource, /export\s*\{\s*RateLimitBucket\s*\}/);
  assert.doesNotMatch(transitionSource, /class\s+RateLimitBucket/);
});
