import assert from 'node:assert/strict';
import test from 'node:test';
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
