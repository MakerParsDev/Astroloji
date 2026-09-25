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

function assertReleaseSha(releaseSha) {
  if (!SHA_PATTERN.test(releaseSha ?? '')) {
    throw new Error('release SHA must be a full 40-character Git commit SHA.');
  }
}

function normalizePaths(paths) {
  if (paths === null) return null;
  return [...new Set((paths ?? []).map((value) => String(value).replaceAll('\\', '/')))]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

export function buildTrackedReleasePlan(
  releaseSha,
  {
    backendPaths = null,
    androidPaths = null,
    playMetadataPaths = null,
  } = {},
) {
  assertReleaseSha(releaseSha);
  const backend = normalizePaths(backendPaths);
  const android = normalizePaths(androidPaths);
  const playMetadata = normalizePaths(playMetadataPaths);
  const allPaths = [...new Set([
    ...(backend ?? []),
    ...(android ?? []),
    ...(playMetadata ?? []),
  ])].sort((left, right) => left.localeCompare(right));

  return {
    releaseSha,
    paths: allPaths,
    backend: backend === null || classifyReleasePaths(backend).backend,
    android: android === null || classifyReleasePaths(android).android,
    playMetadata:
      playMetadata === null || classifyReleasePaths(playMetadata).playMetadata,
  };
}

function readPathInput(name) {
  const bootstrap = process.env[`${name}_BOOTSTRAP`] === 'true';
  if (bootstrap) return null;

  const filePath = process.env[`${name}_PATHS_FILE`];
  if (!filePath) {
    throw new Error(`${name}_PATHS_FILE is required when ${name}_BOOTSTRAP is false.`);
  }
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
}

function writeGithubOutput(plan) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    [
      `release_sha=${plan.releaseSha}`,
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
  const plan = buildTrackedReleasePlan(releaseSha, {
    backendPaths: readPathInput('BACKEND'),
    androidPaths: readPathInput('ANDROID'),
    playMetadataPaths: readPathInput('PLAY_METADATA'),
  });
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
