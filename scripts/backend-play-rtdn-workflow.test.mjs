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
test('Phase B smoke contains no shared-secret loading or value exposure', () => {
  assert.doesNotMatch(smoke, /DOPPLER_TOKEN|doppler secrets|get PLAY_WEBHOOK_SECRET|play_secret/);
  const summaryStart = smoke.indexOf("echo '## Play RTDN production smoke'");
  assert.notEqual(summaryStart, -1);
  const summary = smoke.slice(summaryStart);
  assert.doesNotMatch(summary, /PLAY_WEBHOOK_SECRET|legacy-disabled|Secret source/i);
});

test('Phase B active production paths contain no legacy Play webhook secret dependency', () => {
  const readme = readFileSync('backend/README.md', 'utf8');
  const shared = readFileSync('backend/scripts/shared.ts', 'utf8');
  const active = [deploy, smoke, readme, shared].join('\n');
  const configurationPaths = [deploy, readme, shared].join('\n');
  assert.doesNotMatch(active, /PLAY_WEBHOOK_SECRET/);
  assert.doesNotMatch(configurationPaths, /x-play-secret/i);
  assert.doesNotMatch(configurationPaths, /\?token=/);
});

test('Phase B smoke rejects missing, query-token, and header-secret authentication', () => {
  assert.match(smoke, /unauthorized_status=/);
  assert.match(smoke, /query_token_status=/);
  assert.match(smoke, /header_secret_status=/);
  assert.match(smoke, /test "\$unauthorized_status" = "403"/);
  assert.match(smoke, /test "\$query_token_status" = "403"/);
  assert.match(smoke, /test "\$header_secret_status" = "403"/);
  assert.match(smoke, /jq -e '\.error\.code == \"FORBIDDEN\"'/);
  assert.match(smoke, /play-webhook-unauthorized\.json/);
  assert.match(smoke, /play-webhook-query\.json/);
  assert.match(smoke, /play-webhook-header\.json/);
});
