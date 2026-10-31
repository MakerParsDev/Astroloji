import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..');
const retiredHelper = path.join(repoRoot, 'backend', 'play_translate_selected_locales.mjs');

const ignoredFragments = ['.git', 'node_modules', '.gradle', 'build', 'dist', 'coverage', '.wrangler'];

function shouldIgnore(relativePath) {
  return relativePath.split("/").some((segment) => ignoredFragments.includes(segment));
}

function collectTextFiles() {
  const results = [];
  const walk = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = path.relative(repoRoot, absolutePath).replaceAll('\\', '/');
      if (shouldIgnore(relativePath)) continue;
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (['.mjs', '.js', '.ts', '.json', '.yml', '.yaml', '.md'].includes(path.extname(entry.name))) {
        results.push({ absolutePath, relativePath });
      }
    }
  };
  walk(repoRoot);
  return results;
}

test('retired one-shot translate helper stays inert', () => {
  if (!fs.existsSync(retiredHelper)) return;
  const contents = fs.readFileSync(retiredHelper, 'utf8');
  assert.match(contents, /RETIRED/, 'retired stub must say it is retired');
  assert.doesNotMatch(contents, /mymemory/i, 'retired stub must not call third-party translation');
  assert.doesNotMatch(
    contents,
    /androidpublisher|playRequest|translateText|:commit/,
    'retired stub must not implement direct Play mutation',
  );
  assert.doesNotMatch(contents, /makerpars@gmail\.com/, 'retired stub must not embed personal email');
});

test('no unauthenticated third-party translation bypass remains', () => {
  const offenders = [];
  const needle = ['api', 'mymemory', 'translated', 'net'].join('.');
  for (const file of collectTextFiles()) {
    if (file.relativePath === 'scripts/dead-code-guard.test.mjs') continue;
    const contents = fs.readFileSync(file.absolutePath, 'utf8');
    if (contents.includes(needle)) {
      offenders.push(file.relativePath);
    }
  }
  assert.deepEqual(offenders, [], 'unauthenticated MyMemory translation bypass must not exist in tracked code');
});

test('no stale reference to the retired helper remains', () => {
  const offenders = [];
  const needle = ['play_translate', 'selected_locales'].join('_');
  for (const file of collectTextFiles()) {
    if (file.relativePath === 'scripts/dead-code-guard.test.mjs') continue;
    if (path.resolve(repoRoot, file.relativePath) === retiredHelper) continue;
    const contents = fs.readFileSync(file.absolutePath, 'utf8');
    if (contents.includes(needle)) {
      offenders.push(file.relativePath);
    }
  }
  assert.deepEqual(offenders, [], 'no file may reference the retired one-shot helper');
});
