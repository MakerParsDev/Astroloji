import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/backend-production-deploy.yml', 'utf8');

test('backend production deploy loads operational secrets from Doppler', () => {
  assert.match(workflow, /Load and validate deployment secrets from Doppler/);
  assert.match(workflow, /'ADMIN_SECRET'/);
  assert.match(workflow, /'CLOUDFLARE_API_TOKEN'/);
  assert.doesNotMatch(workflow, /ADMIN_SECRET: \$\{\{ secrets\.ADMIN_SECRET \}\}/);
  assert.doesNotMatch(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
});

test('backend production deploy applies and verifies rewarded SSV', () => {
  assert.match(workflow, /Apply rewarded SSV D1 migration/);
  assert.match(workflow, /migrate-reward-ssv\.sql/);
  assert.match(workflow, /Verify live rewarded SSV endpoint/);
  assert.match(workflow, /check-backend-reward-ssv\.mjs/);
});
