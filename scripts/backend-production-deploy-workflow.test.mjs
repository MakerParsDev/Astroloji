import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/backend-production-deploy.yml', 'utf8');

test('backend production deploy loads operational secrets from Doppler', () => {
  assert.match(workflow, /Load and validate deployment secrets from Doppler/);
  assert.match(workflow, /'ADMIN_SECRET'/);
  assert.match(workflow, /'CLOUDFLARE_API_TOKEN'/);
  assert.match(workflow, /'ADMOB_REWARDED_ID'/);
  assert.doesNotMatch(workflow, /ADMIN_SECRET: \$\{\{ secrets\.ADMIN_SECRET \}\}/);
  assert.doesNotMatch(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
});

test('backend production deploy applies, deploys, and verifies rewarded SSV in order', () => {
  const migration = workflow.indexOf('npx wrangler d1 execute astrology-db --remote --file=scripts/migrate-reward-ssv.sql');
  const notificationMigration = workflow.indexOf(
    'npx wrangler d1 execute astrology-db --remote --file=scripts/migrate-notification-targets.sql',
  );
  const deploy = workflow.indexOf('npm run deploy:doppler');
  const verification = workflow.indexOf('node ../scripts/check-backend-reward-ssv.mjs');

  assert.notEqual(migration, -1);
  assert.notEqual(notificationMigration, -1);
  assert.notEqual(deploy, -1);
  assert.notEqual(verification, -1);
  assert.ok(migration < notificationMigration, 'Reward migration must run before notification migration.');
  assert.ok(notificationMigration < deploy, 'D1 migrations must run before Worker deployment.');
  assert.ok(deploy < verification, 'Live SSV verification must run after deployment.');
});
