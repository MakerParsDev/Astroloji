import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const MIGRATIONS_DIRECTORY = path.join('backend', 'migrations');
const MIGRATION_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.sql$/;

function normalizeSqlForPolicy(sql) {
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
        output += ' ';
        index += 1;
        mode = 'code';
      }
      continue;
    }
    if (mode === 'single-quote' || mode === 'double-quote' || mode === 'backtick') {
      const quote = mode === 'single-quote' ? "'" : mode === 'double-quote' ? '"' : '`';
      output += char === '\n' ? '\n' : ' ';
      if (char === quote && next === quote) {
        output += ' ';
        index += 1;
      } else if (char === quote) {
        mode = 'code';
      }
      continue;
    }
    if (mode === 'bracket') {
      output += char === '\n' ? '\n' : ' ';
      if (char === ']') mode = 'code';
      continue;
    }

    if (char === '-' && next === '-') {
      output += ' ';
      index += 1;
      mode = 'line-comment';
      continue;
    }
    if (char === '/' && next === '*') {
      output += ' ';
      index += 1;
      mode = 'block-comment';
      continue;
    }
    if (char === "'") {
      output += ' ';
      mode = 'single-quote';
      continue;
    }
    if (char === '"') {
      output += ' ';
      mode = 'double-quote';
      continue;
    }
    if (char === '`') {
      output += ' ';
      mode = 'backtick';
      continue;
    }
    if (char === '[') {
      output += ' ';
      mode = 'bracket';
      continue;
    }
    output += char;
  }
  return output;
}

const FORBIDDEN = [
  ['DROP TABLE', /\bDROP\s+TABLE\b/i],
  ['DROP INDEX', /\bDROP\s+INDEX\b/i],
  ['DROP VIEW', /\bDROP\s+VIEW\b/i],
  ['DROP TRIGGER', /\bDROP\s+TRIGGER\b/i],
  ['CREATE TRIGGER', /\bCREATE\s+(?:TEMP(?:ORARY)?\s+)?TRIGGER\b/i],
  ['CREATE UNIQUE INDEX', /\bCREATE\s+UNIQUE\s+INDEX\b/i],
  ['TRUNCATE', /\bTRUNCATE\b/i],
  ['DELETE', /\bDELETE\s+FROM\b/i],
  ['UPDATE', /\bUPDATE\b/i],
  ['unsafe INSERT', /\bINSERT\s+(?!OR\s+IGNORE\b)/i],
  ['REPLACE', /\b(?:INSERT\s+OR\s+)?REPLACE\s+INTO\b/i],
  ['ALTER TABLE DROP', /\bALTER\s+TABLE\b[\s\S]*?\bDROP\b/i],
  ['ALTER TABLE RENAME', /\bALTER\s+TABLE\b[\s\S]*?\bRENAME\b/i],
  ['PRAGMA', /\bPRAGMA\b/i],
];

export function classifyMigrationSql(sql) {
  const normalized = normalizeSqlForPolicy(String(sql));
  const violations = FORBIDDEN
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([name]) => name);

  for (const statement of normalized.split(';')) {
    if (!/\bALTER\s+TABLE\b[\s\S]*?\bADD\s+(?:COLUMN\s+)?/i.test(statement)) continue;
    if (/\bNOT\s+NULL\b/i.test(statement) && !/\bDEFAULT\b/i.test(statement)) {
      violations.push('ALTER TABLE ADD NOT NULL without DEFAULT');
    }
    if (/\bREFERENCES\b/i.test(statement)) {
      violations.push('ALTER TABLE ADD REFERENCES');
    }
  }

  return { violations: [...new Set(violations)] };
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

function git(repositoryRoot, ...args) {
  return execFileSync('/usr/bin/git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
}

function migrationSqlAtRef(repositoryRoot, head, file) {
  return git(repositoryRoot, 'show', `${head}:${file}`);
}

export function validateChangedMigrations({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  base = 'HEAD^',
  head = 'HEAD',
} = {}) {
  const output = git(
    repositoryRoot,
    'diff',
    '--name-status',
    '--no-renames',
    base,
    head,
    '--',
    MIGRATIONS_DIRECTORY,
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
      : migrationSqlAtRef(repositoryRoot, head, change.file);
    const result = validateMigrationChange({ ...change, sql });
    checked.push(change.file);
    if (result.violations.length) failures.push(result);
  }
  return { files: checked, failures };
}

function availableMigrationFiles(repositoryRoot) {
  const directory = path.join(repositoryRoot, MIGRATIONS_DIRECTORY);
  return fs.readdirSync(directory)
    .filter((name) => MIGRATION_FILENAME.test(name))
    .sort((left, right) => left.localeCompare(right));
}

export function parseD1AppliedMigrationNames(output) {
  const payload = JSON.parse(String(output ?? ''));
  const entries = Array.isArray(payload) ? payload : [payload];
  return [...new Set(
    entries
      .flatMap((entry) => (Array.isArray(entry?.results) ? entry.results : []))
      .map((row) => row?.name)
      .filter((name) => typeof name === 'string' && name.length > 0),
  )].sort((left, right) => left.localeCompare(right));
}

export function computePendingMigrationFiles({
  availableFiles,
  appliedFiles = [],
  trackingTablePresent = true,
}) {
  const available = [...new Set(availableFiles ?? [])]
    .sort((left, right) => left.localeCompare(right));
  if (!trackingTablePresent) return available;

  const availableSet = new Set(available);
  for (const file of appliedFiles) {
    if (!MIGRATION_FILENAME.test(file)) {
      throw new Error(`D1 reported an invalid applied migration name: ${file}`);
    }
    if (!availableSet.has(file)) {
      throw new Error(`D1 reported applied migration missing from release checkout: ${file}`);
    }
  }
  const applied = new Set(appliedFiles);
  return available.filter((file) => !applied.has(file));
}

export function validatePendingMigrationFiles({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  files = [],
} = {}) {
  const available = new Set(availableMigrationFiles(repositoryRoot));
  const checked = [];
  const failures = [];

  for (const file of files) {
    if (!MIGRATION_FILENAME.test(file) || path.basename(file) !== file) {
      throw new Error(`Invalid migration filename: ${file}`);
    }
    if (!available.has(file)) {
      throw new Error(`Pending migration does not exist in the release checkout: ${file}`);
    }
    const relative = path.join(MIGRATIONS_DIRECTORY, file);
    const sql = fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');
    const result = validateMigrationChange({ status: 'A', file: relative, sql });
    checked.push(relative);
    if (result.violations.length) failures.push(result);
  }

  return { files: checked, failures };
}

function printResult(result) {
  if (result.failures.length) {
    for (const failure of result.failures) {
      console.error(
        `${failure.file}: destructive/non-reversible SQL blocked: ${failure.violations.join(', ')}`,
      );
    }
    process.exitCode = 1;
    return;
  }
  console.log(`Autonomous migration safety passed for ${result.files.length} migration files.`);
}

function main() {
  const appliedListPath = process.env.MIGRATION_APPLIED_LIST_PATH ?? '';
  if (appliedListPath) {
    const trackingTablePresent = process.env.MIGRATION_TRACKING_TABLE_PRESENT === 'true';
    const appliedFiles = trackingTablePresent
      ? parseD1AppliedMigrationNames(fs.readFileSync(appliedListPath, 'utf8'))
      : [];
    const files = computePendingMigrationFiles({
      availableFiles: availableMigrationFiles(DEFAULT_REPOSITORY_ROOT),
      appliedFiles,
      trackingTablePresent,
    });
    printResult(validatePendingMigrationFiles({ files }));
    return;
  }

  const requestedBase = process.env.MIGRATION_BASE ?? '';
  const base = requestedBase && !/^0+$/.test(requestedBase) ? requestedBase : 'HEAD^';
  const head = process.env.MIGRATION_HEAD || 'HEAD';
  printResult(validateChangedMigrations({ base, head }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
