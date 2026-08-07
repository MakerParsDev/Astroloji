import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlayDiff, formatPlayDiff, loadCanonicalPlayState } from './lib/play-diff.mjs';
import { readBackupFile } from './lib/play-publication.mjs';

function argument(name) {
  const equalsPrefix = `--${name}=`;
  const equalsValue = process.argv.find((value) => value.startsWith(equalsPrefix));
  if (equalsValue) return equalsValue.slice(equalsPrefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function runDiffCli({
  backupPath = argument('backup'),
  expectedRoot = argument('expected-root') ?? process.cwd(),
  outputPath = argument('output'),
} = {}) {
  if (!backupPath) throw new Error('Provide --backup=<absolute-path>.');
  const resolvedBackup = path.resolve(backupPath);
  const resolvedOutput = path.resolve(outputPath ?? `${resolvedBackup}.diff.json`);
  const { backup, backupDigest } = readBackupFile(resolvedBackup);
  const proposed = loadCanonicalPlayState(path.resolve(expectedRoot));
  const diff = buildPlayDiff(backup, proposed);
  const report = {
    generatedAt: new Date().toISOString(),
    backupPath: resolvedBackup,
    backupSha256: backupDigest,
    proposedRoot: path.resolve(expectedRoot),
    diff,
  };
  fs.writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(resolvedOutput, 0o600);
  process.stdout.write(formatPlayDiff(diff));
  console.log(`JSON DIFF: ${resolvedOutput}`);
  console.log(`BACKUP SHA256: ${backupDigest}`);
  if (diff.blockingErrors.length > 0) process.exitCode = 2;
  return { diff, outputPath: resolvedOutput, backupDigest };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    runDiffCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
