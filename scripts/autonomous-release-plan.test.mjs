import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import { buildTrackedReleasePlan, classifyReleasePaths } from './autonomous-release-plan.mjs';

const RELEASE_SHA = 'a'.repeat(40);

test('classifies backend-only changes', () => {
  assert.deepEqual(classifyReleasePaths(['backend/src/index.ts']), {
    backend: true,
    android: false,
    playMetadata: false,
  });
});

test('classifies Android runtime changes separately from Play metadata', () => {
  assert.deepEqual(classifyReleasePaths(['Astroloji/app/src/main/Foo.kt']), {
    backend: false,
    android: true,
    playMetadata: false,
  });
  assert.deepEqual(classifyReleasePaths(['Astroloji/play/listings/en-US/title.txt']), {
    backend: false,
    android: false,
    playMetadata: true,
  });
});

test('classifies mixed product changes', () => {
  assert.deepEqual(
    classifyReleasePaths([
      'backend/src/index.ts',
      'Astroloji/app/src/main/Foo.kt',
      'Astroloji/play/store-config.json',
    ]),
    { backend: true, android: true, playMetadata: true },
  );
});

test('does not deploy documentation or automation-only changes', () => {
  assert.deepEqual(classifyReleasePaths(['docs/a.md', '.github/workflows/ci.yml']), {
    backend: false,
    android: false,
    playMetadata: false,
  });
});

test('release planner is a command-free classifier over trusted workflow diff inputs', async () => {
  const body = await fs.readFile(new URL('./autonomous-release-plan.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(body, /child_process|execFile|spawn|\bgit\s*\(/);
  assert.match(body, /const filePath = process\.env\[`\$\{name\}_PATHS_FILE`\]/);
  const workflow = await fs.readFile(new URL('../.github/workflows/autonomous-production.yml', import.meta.url), 'utf8');
  assert.match(workflow, /BACKEND_PATHS_FILE/);
  assert.match(workflow, /ANDROID_PATHS_FILE/);
  assert.match(workflow, /PLAY_METADATA_PATHS_FILE/);
  assert.match(body, /sort\(\(left, right\) => left\.localeCompare\(right\)\)/);
});

test('workflow resolves durable per-surface diffs from trusted full git history', async () => {
  const workflow = await fs.readFile(
    new URL('../.github/workflows/autonomous-production.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /Autonomous production state/);
  assert.match(workflow, /BACKEND_BASE_SHA/);
  assert.match(workflow, /ANDROID_BASE_SHA/);
  assert.match(workflow, /PLAY_METADATA_BASE_SHA/);
  assert.match(workflow, /fetch-depth:\s*0/);
  assert.match(workflow, /Resolve trusted per-surface release deltas/);
  assert.match(workflow, /git merge-base --is-ancestor/);
  assert.match(workflow, /git diff --name-only --no-renames/);
  assert.match(workflow, /\^\[0-9a-fA-F\]\{40\}\$/);
});

test('tracked plan uses independent per-surface path sets', () => {
  const plan = buildTrackedReleasePlan(RELEASE_SHA, {
    backendPaths: ['backend/src/index.ts', 'docs/backend.md'],
    androidPaths: ['docs/android.md'],
    playMetadataPaths: ['Astroloji/play/listings/en-US/title.txt'],
  });
  assert.equal(plan.backend, true);
  assert.equal(plan.android, false);
  assert.equal(plan.playMetadata, true);
  assert.deepEqual(plan.paths, [
    'Astroloji/play/listings/en-US/title.txt',
    'backend/src/index.ts',
    'docs/android.md',
    'docs/backend.md',
  ]);
});

test('tracked planner treats empty path sets as caught up and missing state as bootstrap', () => {
  const caughtUp = buildTrackedReleasePlan(RELEASE_SHA, {
    backendPaths: [],
    androidPaths: [],
    playMetadataPaths: [],
  });
  assert.equal(caughtUp.backend, false);
  assert.equal(caughtUp.android, false);
  assert.equal(caughtUp.playMetadata, false);

  const bootstrap = buildTrackedReleasePlan(RELEASE_SHA);
  assert.equal(bootstrap.backend, true);
  assert.equal(bootstrap.android, true);
  assert.equal(bootstrap.playMetadata, true);
});

test('tracked planner rejects a non-immutable release identity', () => {
  assert.throws(
    () => buildTrackedReleasePlan('main', { backendPaths: [], androidPaths: [], playMetadataPaths: [] }),
    /40-character Git commit SHA/,
  );
});
