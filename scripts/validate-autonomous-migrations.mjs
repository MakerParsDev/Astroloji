import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function stripSqlComments(sql) {
  let output = '';
  let mode = 'code';
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (mode === 'line-comment') {
      if (char === '\n') {
        output += '\n';
        mode = 'code';
      }
      continue;
    }
    if (mode === 'block-comment') {
      if (char === '*' && next === '/') {
        index += 1;
        mode = 'code';
      }
      continue;
    }
    if (mode === 'single-quote') {
      output += char;
      if (char === "'" && next === "'") {
        output += next;
        index += 1;
      } else if (char === "'") {
        mode = 'code';
      }
      continue;
    }
    if (mode === 'double-quote') {
      output += char;
      if (char === '"' && next === '"') {
        output += next;
        index += 1;
      } else if (char === '"') {
        mode = 'code';
      }
      continue;
    }

    if (char === '-' && next === '-') {
      index += 1;
      mode = 'line-comment';
      continue;
    }
    if (char === '/' && next === '*') {
      index += 1;
      mode = 'block-comment';
      continue;
    }
    if (char === "'") mode = 'single-quote';
    if (char === '"') mode = 'double-quote';
    output += char;
  }
  return output;
}

const FORBIDDEN = [
  ['DROP TABLE', /\bDROP\s+TABLE\b/i],
  ['DROP INDEX', /\bDROP\s+INDEX\b/i],
  ['DROP VIEW', /\bDROP\s+VIEW\b/i],
  ['TRUNCATE', /\bTRUNCATE\b/i],
  ['DELETE', /\bDELETE\s+FROM\b/i],
  ['UPDATE', /\bUPDATE\s+(?:OR\s+\w+\s+)?[\w"'`\[]/i],
  ['REPLACE', /\b(?:INSERT\s+OR\s+)?REPLACE\s+INTO\b/i],
  ['ALTER TABLE DROP', /\bALTER\s+TABLE\b[\s\S]*?\bDROP\b/i],
  ['ALTER TABLE RENAME', /\bALTER\s+TABLE\b[\s\S]*?\bRENAME\b/i],
  ['writable_schema', /\bPRAGMA\s+writable_schema\b/i],
];

export function classifyMigrationSql(sql) {
  const normalized = stripSqlComments(String(sql));
  const violations = FORBIDDEN
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([name]) => name);
  return { violations };
}

export function validateMigrationChange({ status, file, sql = '' }) {
  if (status === 'D') {
    return { file, violations: ['existing migration deleted'] };
  }
  if (status !== 'A') {
    return { file, violations: ['existing migration modified'] };
  }
  return { file, ...classifyMigrationSql(sql) };
}

export function validateChangedMigrations({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  base = 'HEAD^',
  head = 'HEAD',
} = {}) {
  const output = execFileSync(
    '/usr/bin/git',
    ['diff', '--name-status', '--no-renames', base, head, '--', 'backend/migrations'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  ).trim();
  const changes = output
    ? output.split(/\r?\n/).map((line) => {
        const [status, file] = line.split(/\t/, 2);
        return { status, file };
      })
    : [];
  const failures = [];
  const checked = [];
  for (const change of changes) {
    if (!change.file?.endsWith('.sql')) continue;
    const sql = change.status === 'D'
      ? ''
      : fs.readFileSync(path.join(repositoryRoot, change.file), 'utf8');
    const result = validateMigrationChange({ ...change, sql });
    checked.push(change.file);
    if (result.violations.length) failures.push(result);
  }
  return { files: checked, failures };
}

function main() {
  const result = validateChangedMigrations();
  if (result.failures.length) {
    for (const failure of result.failures) {
      console.error(
        `${failure.file}: destructive/non-reversible SQL blocked: ${failure.violations.join(', ')}`,
      );
    }
    process.exit(1);
  }
  console.log(`Autonomous migration safety passed for ${result.files.length} migration files.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
