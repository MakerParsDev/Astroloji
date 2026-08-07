import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const deploy = readFileSync('.github/workflows/backend-production-deploy.yml', 'utf8');
const smoke = readFileSync('.github/workflows/backend-play-webhook-smoke.yml', 'utf8');

test('Phase A production deploy wires and masks RTDN runtime configuration', () => {
  assert.match(deploy, /PLAY_RTDN_AUDIENCE:\s*\$\{\{\s*vars\.PLAY_RTDN_AUDIENCE\s*\}\}/);
  assert.match(
    deploy,
    /PLAY_RTDN_SERVICE_ACCOUNT_EMAIL:\s*\$\{\{\s*vars\.PLAY_RTDN_SERVICE_ACCOUNT_EMAIL\s*\}\}/
  );
  assert.match(deploy, /for name in[^\n]*PLAY_RTDN_AUDIENCE[^\n]*PLAY_RTDN_SERVICE_ACCOUNT_EMAIL/);

  const maskAudience = deploy.indexOf('echo "::add-mask::$PLAY_RTDN_AUDIENCE"');
  const maskCaller = deploy.indexOf('echo "::add-mask::$PLAY_RTDN_SERVICE_ACCOUNT_EMAIL"');
  const workerDeploy = deploy.indexOf('npm run deploy:doppler');
  assert.notEqual(maskAudience, -1);
  assert.notEqual(maskCaller, -1);
  assert.notEqual(workerDeploy, -1);
  assert.ok(maskAudience < workerDeploy && maskCaller < workerDeploy);
});
test('Phase A production deploy reads back RTDN schema before Worker deploy', () => {
  const trackedMigrations = deploy.indexOf('npx wrangler d1 migrations apply astrology-db --remote');
  const schemaReadback = deploy.indexOf('PRAGMA table_info(play_rtdn_messages)');
  const workerDeploy = deploy.indexOf('npm run deploy:doppler');

  assert.notEqual(trackedMigrations, -1);
  assert.notEqual(schemaReadback, -1);
  assert.notEqual(workerDeploy, -1);
  assert.ok(trackedMigrations < schemaReadback, 'Tracked migrations must precede RTDN schema read-back.');
  assert.ok(schemaReadback < workerDeploy, 'RTDN schema read-back must precede Worker deployment.');
  assert.match(deploy, /play-rtdn-schema\.json/);
  assert.match(deploy, /PRAGMA index_list\(play_rtdn_messages\)/);
  assert.match(deploy, /PRAGMA index_info\(idx_play_rtdn_messages_received_at\)/);
  assert.match(deploy, /sqlite_master/);
  assert.match(deploy, /lease_token/);
  assert.match(deploy, /lease_expires_at/);
  assert.match(deploy, /notnull/);
  assert.match(deploy, /pk/);
  assert.match(deploy, /idx_play_rtdn_messages_received_at/);
  assert.match(deploy, /indexColumns\.length !== 1/);
  assert.match(deploy, /indexColumns\[0\]\?\.name !== 'received_at'/);
  assert.match(deploy, /CHECK \(status IN \('processing', 'processed'\)\)/);
  assert.match(deploy, /rm -f[^\n]*doppler-secrets\.json[^\n]*play-rtdn-schema\.json/);
});

test('production deployment summary never renders RTDN runtime configuration values', () => {
  const summaryStart = deploy.indexOf("echo '## Backend production deployment'");
  assert.notEqual(summaryStart, -1);
  const summary = deploy.slice(summaryStart);
  assert.doesNotMatch(summary, /PLAY_RTDN_AUDIENCE/);
  assert.doesNotMatch(summary, /PLAY_RTDN_SERVICE_ACCOUNT_EMAIL/);
});
test('Phase A smoke proves unauthenticated rejection and temporary legacy compatibility', () => {
  assert.match(smoke, /unauthorized_status=/);
  assert.match(smoke, /test "\$unauthorized_status" = "403"/);
  assert.match(smoke, /x-play-secret: \$play_secret/);
  assert.match(smoke, /authorized_status=/);
  assert.match(smoke, /test "\$authorized_status" = "400"/);
  assert.doesNotMatch(smoke, /\?token=/);

  const summaryStart = smoke.indexOf("echo '## Play RTDN production smoke'");
  assert.notEqual(summaryStart, -1);
  const summary = smoke.slice(summaryStart);
  assert.doesNotMatch(summary, /PLAY_WEBHOOK_SECRET/);
  assert.doesNotMatch(summary, /play_secret/);
  assert.doesNotMatch(summary, /Secret source/i);
});