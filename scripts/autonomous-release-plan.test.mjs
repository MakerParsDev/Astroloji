import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import { classifyReleasePaths } from './autonomous-release-plan.mjs';

test('classifies backend-only changes', () => {
  assert.deepEqual(classifyReleasePaths(['backend/src/index.ts']), { backend: true, android: false, playMetadata: false });
});

test('classifies Android runtime changes separately from Play metadata', () => {
  assert.deepEqual(classifyReleasePaths(['Astroloji/app/src/main/Foo.kt']), { backend: false, android: true, playMetadata: false });
  assert.deepEqual(classifyReleasePaths(['Astroloji/play/listings/en-US/title.txt']), { backend: false, android: false, playMetadata: true });
});

test('classifies mixed product changes', () => {
  assert.deepEqual(classifyReleasePaths(['backend/src/index.ts','Astroloji/app/src/main/Foo.kt','Astroloji/play/store-config.json']), { backend: true, android: true, playMetadata: true });
});

test('does not deploy documentation or automation-only changes', () => {
  assert.deepEqual(classifyReleasePaths(['docs/a.md', '.github/workflows/ci.yml']), { backend: false, android: false, playMetadata: false });
});

test('release planner uses first-parent delta semantics so merge commits are supported', async () => {
  const body = await fs.readFile(new URL('./autonomous-release-plan.mjs', import.meta.url), 'utf8');
  assert.match(body, /const parentSha = parents\[0\]/);
  assert.match(body, /git\('diff', '--name-only', '--no-renames', parentSha, releaseSha\)/);
  assert.doesNotMatch(body, /parents\.length !== 1/);
});
