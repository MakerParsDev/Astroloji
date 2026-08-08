import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflowPath = '.github/workflows/backend-admin-capability-sync.yml';

function source() {
  assert.equal(fs.existsSync(workflowPath), true, 'capability sync workflow must exist');
  return fs.readFileSync(workflowPath, 'utf8');
}

const capabilities = [
  ['content-ops', 'production-admin-content', 'ADMIN_CONTENT_SECRET'],
  ['notification-ops', 'production-admin-notification', 'ADMIN_NOTIFICATION_SECRET'],
  ['play-read', 'production-admin-play-read', 'ADMIN_PLAY_READ_SECRET'],
  ['play-write', 'production-admin-play-write', 'ADMIN_PLAY_WRITE_SECRET']
];

test('capability sync exposes one guarded choice and all four protected environments', () => {
  const workflow = source();
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /type:\s*choice/);
  assert.match(workflow, /SYNC_ADMIN_CAPABILITY/);
  for (const [capability, environment] of capabilities) {
    assert.match(workflow, new RegExp(capability));
    assert.match(workflow, new RegExp(`environment:\\s*${environment}`));
  }
});

test('each capability job receives only its own admin secret', () => {
  const workflow = source();
  for (const [capability, environment, secret] of capabilities) {
    const jobStart = workflow.indexOf(`environment: ${environment}`);
    assert.notEqual(jobStart, -1, `${capability} environment missing`);
    const nextEnvironment = workflow.indexOf('environment: production-admin-', jobStart + 1);
    const job = workflow.slice(jobStart, nextEnvironment === -1 ? workflow.length : nextEnvironment);
    assert.match(job, new RegExp(`ADMIN_CAPABILITY_SECRET: \\$\\{\\{ secrets\\.${secret} \\}\\}`));
    assert.match(job, new RegExp(`WORKER_SECRET_NAME: ${secret}`));
    for (const [, , otherSecret] of capabilities) {
      if (otherSecret !== secret) assert.doesNotMatch(job, new RegExp(otherSecret));
    }
    assert.doesNotMatch(job, /DOPPLER_TOKEN|doppler secrets/);
  }
});

test('capability secrets are synced through stdin and verification is non-destructive', () => {
  const workflow = source();
  assert.match(workflow, /printf '%s' "\$ADMIN_CAPABILITY_SECRET" \| npx wrangler secret put "\$WORKER_SECRET_NAME"/);
  assert.match(workflow, /\/admin\/content\/backfill/);
  assert.match(workflow, /\/notifications\/send/);
  assert.match(workflow, /\/admin\/play\/subscriptions/);
  assert.match(workflow, /\/admin\/play\/subscriptions\/verification-id/);
  assert.match(workflow, /error\.code/);
  assert.match(workflow, /FORBIDDEN/);
  assert.match(workflow, /--output \/dev\/null/);
  const withoutMaskCommands = workflow.replaceAll('echo "::add-mask::$ADMIN_CAPABILITY_SECRET"', '');
  assert.doesNotMatch(withoutMaskCommands, /echo[^\n]*ADMIN_CAPABILITY_SECRET/);
});


test('mistyped confirmation fails before protected capability jobs can run', () => {
  const workflow = source();
  const guardStart = workflow.indexOf('\n  guard:');
  assert.notEqual(guardStart, -1, 'non-environment confirmation guard job missing');
  const firstCapabilityJob = workflow.indexOf('\n  content:', guardStart);
  assert.notEqual(firstCapabilityJob, -1, 'content capability job missing after guard');
  const guard = workflow.slice(guardStart, firstCapabilityJob);
  assert.doesNotMatch(guard, /environment:/);
  assert.match(guard, /inputs\.confirm/);
  assert.match(guard, /SYNC_ADMIN_CAPABILITY/);
  assert.match(guard, /exit 1/);
  assert.equal((workflow.match(/\n    needs: guard\n/g) ?? []).length, capabilities.length);
});

test('production capability checkout steps never persist GitHub credentials', () => {
  const workflow = source();
  assert.equal((workflow.match(/uses: actions\/checkout@v6/g) ?? []).length, capabilities.length);
  assert.equal((workflow.match(/persist-credentials:\s*false/g) ?? []).length, capabilities.length);
});
