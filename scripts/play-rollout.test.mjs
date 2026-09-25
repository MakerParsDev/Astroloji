import assert from 'node:assert/strict';
import test from 'node:test';

import { decideRolloutAction, evaluateVitals } from './reconcile-play-rollout.mjs';

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
