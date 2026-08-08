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
  assert.match(config, /\[\[durable_objects\.bindings\]\][\s\S]*?name\s*=\s*"RATE_LIMITER"[\s\S]*?class_name\s*=\s*"RateLimitBucket"[\s\S]*?script_name\s*=\s*"astrology-backend"/);
  assert.doesNotMatch(config, /\[exports\.RateLimitBucket\]/);

  const transitionSource = read('backend/src/transition/index.ts');
  assert.doesNotMatch(transitionSource, /export\s*\{\s*RateLimitBucket\s*\}/);
  assert.doesNotMatch(transitionSource, /class\s+RateLimitBucket/);
});
