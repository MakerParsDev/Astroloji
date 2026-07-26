import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const deploy = fs.readFileSync('.github/workflows/backend-ssv-transition-deploy.yml', 'utf8');
const rollback = fs.readFileSync('.github/workflows/backend-ssv-transition-rollback.yml', 'utf8');
const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
const transitionConfig = fs.readFileSync('backend/wrangler.transition.toml', 'utf8');
const plan = fs.readFileSync('docs/superpowers/plans/2026-07-26-ssv-transition-router.md', 'utf8');
const design = fs.readFileSync('docs/superpowers/specs/2026-07-26-ssv-transition-router-design.md', 'utf8');
const backendReadme = fs.readFileSync('backend/README.md', 'utf8');
const readiness = fs.readFileSync('docs/PLAY_PRODUCTION_READINESS.md', 'utf8');

function ordered(content, tokens) {
  const positions = tokens.map((token) => content.indexOf(token));
  assert.ok(positions.every((position) => position >= 0), `Missing ordered token: ${tokens[positions.indexOf(-1)]}`);
  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(positions[index - 1] < positions[index], `${tokens[index - 1]} must precede ${tokens[index]}`);
  }
}

test('transition config cannot attach production routes by itself', () => {
  assert.match(transitionConfig, /name = "astrology-ssv-transition"/);
  assert.match(transitionConfig, /workers_dev = false/);
  assert.doesNotMatch(transitionConfig, /\[\[routes\]\]/);
  assert.doesNotMatch(transitionConfig, /astrology\.parsfilo\.com\/api\/v1\/rewards/);
});

test('deploy workflow validates gates and attaches route only after worker and secrets are ready', () => {
  assert.match(deploy, /confirm:[\s\S]*DEPLOY_TRANSITION/);
  assert.match(deploy, /legacy_forward_until/);
  assert.match(deploy, /ENABLE_PRODUCTION_RELEASE/);
  assert.match(deploy, /must remain false|== "false"|!= "false"/);
  assert.match(deploy, /30 days|30 \* 24 \* 60 \* 60/);
  assert.match(deploy, /astrology-ssv-transition/);
  assert.match(deploy, /astrology\.parsfilo\.com\/api\/v1\/rewards\/\*/);

  ordered(deploy, [
    'migrate-reward-ssv.sql',
    'deploy:transition',
    'transition:secrets',
    'wrangler secret list',
    '/workers/routes',
    'check-ssv-transition-route.mjs'
  ]);

  assert.doesNotMatch(deploy, /deploy:doppler/);
  assert.doesNotMatch(deploy, /npm run deploy\s*$/m);
  assert.doesNotMatch(deploy, /backend-production-deploy/);
  assert.match(deploy, /CLOUDFLARE_API_TOKEN/);
  assert.match(deploy, /wrangler secret list[^\n]*--format json/);
  assert.match(deploy, /body\.result\?\.deployments\?\.\[0\]\?\.id/);
  assert.doesNotMatch(deploy, /body\.result\?\.\[0\]\?\.id/);
  assert.match(deploy, /for \(const name of required\)[\s\S]*::add-mask::\$\{value\(name\)\}/);
  assert.equal((deploy.match(/persist-credentials: false/g) ?? []).length, 1);
  assert.equal((rollback.match(/persist-credentials: false/g) ?? []).length, 1);
  assert.ok((deploy.match(/node --input-type=module <<'NODE'/g) ?? []).length >= 2);
  ordered(deploy, [
    'id: attach_route',
    'check-ssv-transition-route.mjs',
    'Remove exact transition route after failed live verification'
  ]);
  assert.match(deploy, /id: attach_route[\s\S]*GITHUB_OUTPUT[\s\S]*created=/);
  assert.match(deploy, /id: verify_route[\s\S]*check-ssv-transition-route\.mjs/);
  const cleanupStart = deploy.indexOf('name: Remove exact transition route after failed live verification');
  const cleanupEnd = deploy.indexOf('name: Remove temporary deployment files', cleanupStart);
  const cleanup = deploy.slice(cleanupStart, cleanupEnd);
  assert.match(
    cleanup,
    /if: failure\(\) && steps\.verify_route\.outcome == 'failure' && steps\.attach_route\.outputs\.created == 'true'/
  );
  assert.match(cleanup, /route\.pattern === process\.env\.TRANSITION_ROUTE_PATTERN/);
  assert.match(cleanup, /route\.script !== process\.env\.TRANSITION_WORKER_NAME/);
  assert.match(cleanup, /route\.id !== process\.env\.TRANSITION_ROUTE_ID/);
  assert.match(cleanup, /fetch\(`\$\{api\}\/\$\{route\.id\}`,[\s\S]*method: 'DELETE'/);
});

test('rollback removes only the exact route before origin verification and optional deletion', () => {
  assert.match(rollback, /REMOVE_TRANSITION_ROUTE/);
  assert.match(rollback, /astrology\.parsfilo\.com\/api\/v1\/rewards\/\*/);
  assert.match(rollback, /DELETE/);
  assert.match(rollback, /route\.id|route_id|ROUTE_ID/);
  assert.match(rollback, /api\/v1\/health/);
  assert.match(rollback, /api\/v1\/rewards\/ssv/);
  assert.match(rollback, /403/);

  ordered(rollback, [
    '/workers/routes',
    'method: \'DELETE\'',
    '/api/v1/health',
    '/api/v1/rewards/ssv',
    'wrangler delete'
  ]);
  assert.match(rollback, /delete_worker/);
  assert.match(rollback, /node --input-type=module <<'NODE'/);
  assert.match(rollback, /Leave rewarded SSV D1 migration intact|D1 migration remains/);
});

test('CI runs transition bundle and runtime verification with minimal permissions', () => {
  assert.match(ci, /backend-verify:[\s\S]*permissions:[\s\S]*contents: read/);
  assert.match(ci, /npm run build:transition/);
  assert.match(ci, /npm run test:runtime:transition/);
  assert.match(ci, /backend-ssv-transition-workflows\.test\.mjs|scripts\/\*\.test\.mjs/);
});


test('operator docs use PowerShell and preserve fail-closed deployment and rollback order', () => {
  for (const content of [plan, backendReadme, readiness]) {
    assert.doesNotMatch(content, /```bash/);
  }
  assert.match(plan, /"deploy:transition": "tsx scripts\/deploy-transition\.ts"/);
  const removeRoute = design.indexOf('Remove the exact reward route');
  const verifyOrigin = design.indexOf('verify origin health');
  const deleteWorker = design.indexOf('optionally delete');
  assert.ok(removeRoute >= 0 && removeRoute < verifyOrigin && verifyOrigin < deleteWorker);
});
