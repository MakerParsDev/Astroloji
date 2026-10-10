import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scanner = fileURLToPath(new URL('./scan-secrets.mjs', import.meta.url));
const fixture = ['JWT_', 'SECRET', '="', 'x'.repeat(32), '"'].join('');

function check(files, verify) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astroloji-scan-test-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      const absolute = path.join(root, name);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, content);
    }
    verify(spawnSync(process.execPath, [scanner], { cwd: root, encoding: 'utf8' }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('scans GitHub workflows and the Android build script', () => {
  check({ '.github/workflows/release.yml': fixture, 'Astroloji/build.gradle.kts': fixture }, (result) => {
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /\.github\/workflows\/release\.yml:/);
    assert.match(result.stderr, /Astroloji\/build\.gradle\.kts:/);
  });
});

test('ignores exact generated/secret directory segments', () => {
  check({
    '.git/hooks/check.yml': fixture,
    'Astroloji/build/generated.yml': fixture,
    'backend/node_modules/lib/config.json': fixture,
    'backend/SECRETS/local.json': fixture
  }, (result) => assert.equal(result.status, 0, result.stderr));
});

test('normal filenames containing build still get scanned', () => {
  check({ 'reports/build-report.yml': fixture }, (result) => {
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /reports\/build-report\.yml:/);
  });
});
