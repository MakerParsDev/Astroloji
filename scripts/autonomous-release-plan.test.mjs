import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { buildTrackedReleasePlan, classifyReleasePaths } from './autonomous-release-plan.mjs';

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
  assert.match(body, /const paths = diffPaths\(parentSha, releaseSha\)/);
  assert.match(body, /git\('diff', '--name-only', '--no-renames', baseSha, releaseSha\)/);
  assert.doesNotMatch(body, /parents\.length !== 1/);
});


test('workflow release planner is wired to durable production state rather than only HEAD parent', async () => {
  const workflow = await fs.readFile(new URL('../.github/workflows/autonomous-production.yml', import.meta.url), 'utf8');
  assert.match(workflow, /Autonomous production state/);
  assert.match(workflow, /BACKEND_BASE_SHA/);
  assert.match(workflow, /ANDROID_BASE_SHA/);
  assert.match(workflow, /PLAY_METADATA_BASE_SHA/);
  assert.match(workflow, /fetch-depth:\s*0/);
});


test('tracked release plan uses independent per-surface baselines and full-reconciles missing state', async () => {
  const body = await fs.readFile(new URL('./autonomous-release-plan.mjs', import.meta.url), 'utf8');
  assert.match(body, /buildTrackedReleasePlan/);
  assert.match(body, /backendPaths === null \|\| classifyReleasePaths\(backendPaths\)\.backend/);
  assert.match(body, /androidPaths === null \|\| classifyReleasePaths\(androidPaths\)\.android/);
  assert.match(body, /playMetadataPaths === null \|\| classifyReleasePaths\(playMetadataPaths\)\.playMetadata/);
  assert.match(body, /merge-base', '--is-ancestor/);
});


test('tracked planner advances clean baselines and bootstraps missing surfaces', () => {
  const head = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const noOp = buildTrackedReleasePlan(head, {
    backendBaseSha: head,
    androidBaseSha: head,
    playMetadataBaseSha: head,
  });
  assert.equal(noOp.backend, false);
  assert.equal(noOp.android, false);
  assert.equal(noOp.playMetadata, false);

  const bootstrap = buildTrackedReleasePlan(head);
  assert.equal(bootstrap.backend, true);
  assert.equal(bootstrap.android, true);
  assert.equal(bootstrap.playMetadata, true);
});
