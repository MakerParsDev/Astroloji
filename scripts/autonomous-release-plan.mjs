import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/i;

export function classifyReleasePaths(paths) {
  const normalized = [...new Set((paths ?? []).map((value) => String(value).replaceAll('\\', '/')))];
  return {
    backend: normalized.some((path) => path.startsWith('backend/')),
    android: normalized.some((path) => path.startsWith('Astroloji/') && !path.startsWith('Astroloji/play/')),
    playMetadata: normalized.some((path) => path.startsWith('Astroloji/play/')),
  };
}

function git(...args) {
  return execFileSync('/usr/bin/git', args, { encoding: 'utf8' }).trim();
}

function assertCommitSha(name, sha) {
  if (!SHA_PATTERN.test(sha ?? '')) {
    throw new Error(`${name} must be a full 40-character Git commit SHA.`);
  }
  git('cat-file', '-e', `${sha}^{commit}`);
}

function diffPaths(baseSha, releaseSha) {
  return git('diff', '--name-only', '--no-renames', baseSha, releaseSha)
    .split(/\r?\n/)
    .filter(Boolean);
}

function assertAncestor(name, baseSha, releaseSha) {
  try {
    git('merge-base', '--is-ancestor', baseSha, releaseSha);
  } catch {
    throw new Error(`${name} ${baseSha} is not an ancestor of release SHA ${releaseSha}.`);
  }
}

export function buildReleasePlan(releaseSha) {
  assertCommitSha('release SHA', releaseSha);
  const parents = git('show', '-s', '--format=%P', releaseSha).split(/\s+/).filter(Boolean);
  if (parents.length < 1) {
    throw new Error('Autonomous production requires a non-root main commit.');
  }
  const parentSha = parents[0];
  const paths = diffPaths(parentSha, releaseSha);
  return {
    releaseSha,
    parentSha,
    paths,
    ...classifyReleasePaths(paths),
  };
}

export function buildTrackedReleasePlan(
  releaseSha,
  {
    backendBaseSha = '',
    androidBaseSha = '',
    playMetadataBaseSha = '',
  } = {},
) {
  assertCommitSha('release SHA', releaseSha);

  const pathsSince = (name, baseSha) => {
    if (!baseSha) return null;
    assertCommitSha(name, baseSha);
    assertAncestor(name, baseSha, releaseSha);
    return diffPaths(baseSha, releaseSha);
  };

  const backendPaths = pathsSince('backend baseline SHA', backendBaseSha);
  const androidPaths = pathsSince('Android baseline SHA', androidBaseSha);
  const playMetadataPaths = pathsSince('Play metadata baseline SHA', playMetadataBaseSha);
  const allPaths = [...new Set([
    ...(backendPaths ?? []),
    ...(androidPaths ?? []),
    ...(playMetadataPaths ?? []),
  ])].sort();

  return {
    releaseSha,
    backendBaseSha,
    androidBaseSha,
    playMetadataBaseSha,
    paths: allPaths,
    backend: backendPaths === null || classifyReleasePaths(backendPaths).backend,
    android: androidPaths === null || classifyReleasePaths(androidPaths).android,
    playMetadata:
      playMetadataPaths === null || classifyReleasePaths(playMetadataPaths).playMetadata,
  };
}

function writeGithubOutput(plan) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    [
      `release_sha=${plan.releaseSha}`,
      `parent_sha=${plan.parentSha ?? ''}`,
      `backend_base_sha=${plan.backendBaseSha ?? ''}`,
      `android_base_sha=${plan.androidBaseSha ?? ''}`,
      `play_metadata_base_sha=${plan.playMetadataBaseSha ?? ''}`,
      `backend=${String(plan.backend)}`,
      `android=${String(plan.android)}`,
      `play_metadata=${String(plan.playMetadata)}`,
      `changed_files=${plan.paths.length}`,
      '',
    ].join('\n'),
  );
}

function main() {
  const releaseSha = process.argv[2] ?? process.env.RELEASE_SHA ?? '';
  const plan = process.env.AUTONOMOUS_RELEASE_TRACKED_STATE === 'true'
    ? buildTrackedReleasePlan(releaseSha, {
        backendBaseSha: process.env.BACKEND_BASE_SHA ?? '',
        androidBaseSha: process.env.ANDROID_BASE_SHA ?? '',
        playMetadataBaseSha: process.env.PLAY_METADATA_BASE_SHA ?? '',
      })
    : buildReleasePlan(releaseSha);
  writeGithubOutput(plan);
  console.log(JSON.stringify(plan, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
