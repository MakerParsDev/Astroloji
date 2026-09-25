import assert from 'node:assert/strict';
import test from 'node:test';

import { decideRolloutAction, evaluateVitals, parseAutonomousReleaseName, reconcilePlayRollout } from './reconcile-play-rollout.mjs';

test('halts when crash or ANR thresholds are exceeded', () => {
  assert.equal(evaluateVitals({ crashRate: 0.03, anrRate: 0.001, distinctUsers: 200 }).state, 'unhealthy');
  assert.equal(evaluateVitals({ crashRate: 0.001, anrRate: 0.02, distinctUsers: 200 }).state, 'unhealthy');
});

test('treats low-volume vitals as insufficient rather than healthy', () => {
  assert.equal(evaluateVitals({ crashRate: 0, anrRate: 0, distinctUsers: 10 }).state, 'insufficient');
});

test('freezes promotion when Play Developer Reporting is unavailable', () => {
  assert.equal(evaluateVitals({ crashRate: null, anrRate: null, distinctUsers: null, reportingAvailable: false }).state, 'unavailable');
  assert.deepEqual(decideRolloutAction({ status: 'inProgress', fraction: 0.1, ageHours: 240, vitalsState: 'unavailable' }), { action: 'hold', targetFraction: 0.1 });
});

test('promotes healthy staged rollout on conservative schedule', () => {
  assert.deepEqual(decideRolloutAction({ status: 'inProgress', fraction: 0.1, ageHours: 30, vitalsState: 'healthy' }), { action: 'promote', targetFraction: 0.25 });
  assert.deepEqual(decideRolloutAction({ status: 'inProgress', fraction: 0.25, ageHours: 55, vitalsState: 'healthy' }), { action: 'promote', targetFraction: 0.5 });
  assert.deepEqual(decideRolloutAction({ status: 'inProgress', fraction: 0.5, ageHours: 100, vitalsState: 'healthy' }), { action: 'complete', targetFraction: 1 });
});

test('uses longer soak windows when vitals are insufficient', () => {
  assert.deepEqual(decideRolloutAction({ status: 'inProgress', fraction: 0.1, ageHours: 30, vitalsState: 'insufficient' }), { action: 'hold', targetFraction: 0.1 });
  assert.deepEqual(decideRolloutAction({ status: 'inProgress', fraction: 0.1, ageHours: 80, vitalsState: 'insufficient' }), { action: 'promote', targetFraction: 0.25 });
});

test('never resumes a halted release and halts an unhealthy staged release', () => {
  assert.deepEqual(decideRolloutAction({ status: 'halted', fraction: 0.25, ageHours: 999, vitalsState: 'healthy' }), { action: 'hold', targetFraction: 0.25 });
  assert.deepEqual(decideRolloutAction({ status: 'inProgress', fraction: 0.25, ageHours: 60, vitalsState: 'unhealthy' }), { action: 'halt', targetFraction: 0.25 });
});


test('release provenance requires the exact machine-recorded release name', async () => {
  assert.deepEqual(parseAutonomousReleaseName('auto-v1-42-1700000000-abcdef1'), {
    versionCode: '42',
    epochSeconds: 1700000000,
    sha7: 'abcdef1',
  });
  const fs = await import('node:fs/promises');
  const workflow = await fs.readFile(new URL('../.github/workflows/android-rollout-controller.yml', import.meta.url), 'utf8');
  assert.match(workflow, /Autonomous production state/);
  assert.match(workflow, /android_release_name/);
  assert.match(workflow, /EXPECTED_AUTONOMOUS_RELEASE_NAME/);
});


test('rollout reconciliation does not adopt a newer lookalike autonomous release', async () => {
  const expected = 'auto-v1-42-1700000000-abcdef1';
  const newer = 'auto-v1-43-1800000000-deadbee';
  const client = {
    createEdit: async () => ({ id: 'edit-1' }),
    getTrack: async () => ({
      track: 'production',
      releases: [
        { name: newer, status: 'completed', versionCodes: ['43'] },
        { name: expected, status: 'completed', versionCodes: ['42'] },
      ],
    }),
    deleteEdit: async () => {},
  };
  const result = await reconcilePlayRollout({
    packageName: 'com.example.app',
    expectedReleaseName: expected,
    client,
    fetchImpl: async () => ({ ok: true }),
  });
  assert.equal(result.releaseName, expected);
  assert.equal(result.versionCode, '42');
  assert.equal(result.action, 'hold');
});

test('rollout reconciliation holds when machine-owned release provenance is absent', async () => {
  const result = await reconcilePlayRollout({
    packageName: 'com.example.app',
    expectedReleaseName: '',
    client: {},
  });
  assert.equal(result.action, 'hold');
  assert.match(result.reason, /provenance/i);
});
