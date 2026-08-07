import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { cliArgument } from './lib/cli-arguments.mjs';

test('CLI argument parser accepts equals and separate-value forms', () => {
  assert.equal(cliArgument('backup', ['--backup=/tmp/a.json']), '/tmp/a.json');
  assert.equal(cliArgument('backup', ['--backup', '/tmp/a.json']), '/tmp/a.json');
  assert.equal(cliArgument('backup', ['--other', 'x']), undefined);
});

test('CLI argument parser rejects missing, empty, flag-shaped, and duplicate values', () => {
  for (const argv of [
    ['--backup'],
    ['--backup='],
    ['--backup', '   '],
    ['--backup', '--confirmation', 'x'],
    ['--backup=a', '--backup=b'],
  ]) {
    assert.throws(() => cliArgument('backup', argv), /requires a non-empty value|only be specified once/i);
  }
});


test('baseline CLI uses the shared strict argument parser', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, 'input.json');
  const output = path.join(root, 'output.json');
  fs.writeFileSync(input, JSON.stringify({
    collectedAt: '2026-08-07T04:10:00.000Z',
    window: { start: '2026-07-04', end: '2026-08-02' },
    play: {}, stability: {}, analytics: {}, subscriptions: {}, ads: {},
  }));
  const ok = spawnSync(process.execPath, ['scripts/capture-play-baseline.mjs', `--input=${input}`, `--output=${output}`], { encoding: 'utf8' });
  assert.equal(ok.status, 0, `${ok.stdout}\n${ok.stderr}`);
  const duplicate = spawnSync(process.execPath, ['scripts/capture-play-baseline.mjs', '--input', input, '--input', input, '--output', output], { encoding: 'utf8' });
  assert.notEqual(duplicate.status, 0);
  assert.match(`${duplicate.stdout}\n${duplicate.stderr}`, /only be specified once/i);
  const flagValue = spawnSync(process.execPath, ['scripts/capture-play-baseline.mjs', '--input', '--output', output], { encoding: 'utf8' });
  assert.notEqual(flagValue.status, 0);
  assert.match(`${flagValue.stdout}\n${flagValue.stderr}`, /requires a non-empty value/i);
});
