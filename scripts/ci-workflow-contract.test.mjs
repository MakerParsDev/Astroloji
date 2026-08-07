import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');

function parseCiContract(source) {
  const lines = source.split(/\r?\n/);
  const result = {
    pushBranches: [],
    pullRequestBranches: [],
    concurrency: {},
  };

  let section = null;
  let subsection = null;
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;

    if (indent === 0) {
      section = trimmed.endsWith(':') ? trimmed.slice(0, -1) : null;
      subsection = null;
      continue;
    }

    if (section === 'on') {
      if (indent === 2 && trimmed.endsWith(':')) {
        subsection = trimmed.slice(0, -1);
        continue;
      }
      if (indent === 4 && trimmed === 'branches:') continue;
      if (indent === 6 && trimmed.startsWith('- ')) {
        const value = trimmed.slice(2).replace(/^['"]|['"]$/g, '');
        if (subsection === 'push') result.pushBranches.push(value);
        if (subsection === 'pull_request') result.pullRequestBranches.push(value);
      }
      continue;
    }

    if (section === 'concurrency' && indent === 2) {
      const separator = trimmed.indexOf(':');
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      const rawValue = trimmed.slice(separator + 1).trim();
      result.concurrency[key] = rawValue === 'true' ? true : rawValue === 'false' ? false : rawValue;
    }
  }

  return result;
}

const contract = parseCiContract(workflow);

test('CI runs once for feature PR updates and still validates main pushes', () => {
  assert.deepEqual(contract.pushBranches, ['main']);
  assert.deepEqual(contract.pullRequestBranches, ['main']);
});

test('CI cancels superseded runs for the same PR or ref', () => {
  assert.equal(contract.concurrency.group, 'ci-${{ github.event.pull_request.number || github.ref }}');
  assert.equal(contract.concurrency['cancel-in-progress'], true);
});
