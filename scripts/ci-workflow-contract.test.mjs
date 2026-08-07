import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');

test('CI runs once for feature PR updates and still validates main pushes', () => {
  assert.match(workflow, /push:\s*\n\s*branches:\s*\n\s*-\s*main/);
  assert.doesNotMatch(workflow, /-\s*["']?\*\*["']?/);
  assert.match(workflow, /pull_request:\s*\n\s*branches:\s*\n\s*-\s*main/);
});

test('CI cancels superseded runs for the same PR or ref', () => {
  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /github\.event\.pull_request\.number/);
  assert.match(workflow, /github\.ref/);
  assert.match(workflow, /cancel-in-progress:\s*true/);
});
