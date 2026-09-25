import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function classifyReleasePaths(paths) {
  const normalized = [...new Set((paths ?? []).map((value) => String(value).replaceAll('\\', '/')))];
  return {
    backend: normalized.some((path) => path.startsWith('backend/')),
    android: normalized.some((path) => path.startsWith('Astroloji/') && !path.startsWith('Astroloji/play/')),
    playMetadata: normalized.some((path) => path.startsWith('Astroloji/play/')),
  };
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

export function buildReleasePlan(releaseSha) {
  if (!/^[0-9a-f]{40}$/i.test(releaseSha ?? '')) {
    throw new Error('release SHA must be a full 40-character Git commit SHA.');
  }
  git('cat-file', '-e', `${releaseSha}^{commit}`);
  const parents = git('show', '-s', '--format=%P', releaseSha).split(/\s+/).filter(Boolean);
  if (parents.length < 1) {
    throw new Error('Autonomous production requires a non-root main commit.');
  }
  // First parent is the previous main state for both squash commits and merge commits.
  const parentSha = parents[0];
  const paths = git('diff', '--name-only', '--no-renames', parentSha, releaseSha)
    .split(/\r?\n/)
    .filter(Boolean);
  return {
    releaseSha,
    parentSha,
    paths,
    ...classifyReleasePaths(paths),
  };
}

function writeGithubOutput(plan) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    [
      `release_sha=${plan.releaseSha}`,
      `parent_sha=${plan.parentSha}`,
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
  const plan = buildReleasePlan(releaseSha);
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
