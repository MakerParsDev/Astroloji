import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyMigrationSql,
  computePendingMigrationFiles,
  parseD1AppliedMigrationNames,
  validateMigrationChange,
  validatePendingMigrationFiles,
} from './validate-autonomous-migrations.mjs';

test('allows additive schema migrations', () => {
  for (const sql of [
    'CREATE TABLE users (id TEXT PRIMARY KEY);',
    'CREATE INDEX idx_users_id ON users(id);',
    'ALTER TABLE users ADD COLUMN display_name TEXT;',
    'INSERT OR IGNORE INTO settings(key, value) VALUES ("v", "1");',
  ]) {
    assert.deepEqual(classifyMigrationSql(sql).violations, [], sql);
  }
});

test('blocks destructive or non-reversible migration statements', () => {
  for (const sql of [
    'DROP TABLE users;',
    'DROP INDEX idx_users_id;',
    'DROP TRIGGER trg_users;',
    'DROP/**/TABLE users;',
    'TRUNCATE TABLE users;',
    'DELETE FROM users;',
    'UPDATE users SET name = "x";',
    'ALTER TABLE users DROP COLUMN name;',
    'ALTER TABLE users RENAME TO old_users;',
    'REPLACE INTO settings(key, value) VALUES ("v", "2");',
    'PRAGMA foreign_keys=OFF;',
    'CREATE TRIGGER touch_users AFTER UPDATE ON users BEGIN SELECT 1; END;',
    'CREATE UNIQUE INDEX uniq_users_name ON users(name);',
    'ALTER TABLE users ADD COLUMN required_value TEXT NOT NULL;',
    'ALTER TABLE users ADD COLUMN parent_id TEXT REFERENCES users(id);',
    'INSERT INTO settings(key, value) VALUES ("v", "2");',
  ]) {
    assert.ok(classifyMigrationSql(sql).violations.length > 0, sql);
  }
});

test('ignores destructive keywords inside SQL comments', () => {
  const sql = `
    -- DROP TABLE old_table;
    /* DELETE FROM old_table; */
    CREATE TABLE safe_table (id TEXT PRIMARY KEY);
  `;
  assert.deepEqual(classifyMigrationSql(sql).violations, []);
});


test('never edits or deletes an already-applied migration', () => {
  assert.deepEqual(
    validateMigrationChange({ status: 'M', file: 'backend/migrations/0001.sql', sql: 'CREATE TABLE x(id TEXT);' }).violations,
    ['existing migration modified'],
  );
  assert.deepEqual(
    validateMigrationChange({ status: 'D', file: 'backend/migrations/0001.sql' }).violations,
    ['existing migration deleted'],
  );
});


test('uses a fixed Git executable path for CI diff inspection', async () => {
  const fs = await import('node:fs/promises');
  const body = await fs.readFile(new URL('./validate-autonomous-migrations.mjs', import.meta.url), 'utf8');
  assert.match(body, /execFileSync\(\s*['"]\/usr\/bin\/git['"]/);
  assert.doesNotMatch(body, /execFileSync\(\s*['"]git['"]/);
});


test('ignores destructive keywords inside quoted literals', () => {
  const sql = `
    INSERT OR IGNORE INTO audit_log(message) VALUES ('DROP TABLE users');
    INSERT OR IGNORE INTO audit_log(message) VALUES ("DELETE FROM users");
  `;
  assert.deepEqual(classifyMigrationSql(sql).violations, []);
});


test('computes pending D1 migrations from read-only applied-migration state', () => {
  const applied = parseD1AppliedMigrationNames(JSON.stringify([
    { results: [{ name: '0001_done.sql' }] },
  ]));
  assert.deepEqual(applied, ['0001_done.sql']);
  assert.deepEqual(
    computePendingMigrationFiles({
      availableFiles: ['0001_done.sql', '0002_pending.sql'],
      appliedFiles: applied,
      trackingTablePresent: true,
    }),
    ['0002_pending.sql'],
  );
  assert.deepEqual(
    computePendingMigrationFiles({
      availableFiles: ['0001_done.sql', '0002_pending.sql'],
      trackingTablePresent: false,
    }),
    ['0001_done.sql', '0002_pending.sql'],
  );
  assert.throws(
    () => computePendingMigrationFiles({
      availableFiles: ['0001_done.sql'],
      appliedFiles: ['9999_unknown.sql'],
      trackingTablePresent: true,
    }),
    /missing from release checkout/i,
  );
});

test('validates only named pending migration files and rejects traversal', async () => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'migration-pending-'));
  await fs.mkdir(path.join(root, 'backend', 'migrations'), { recursive: true });
  await fs.writeFile(path.join(root, 'backend', 'migrations', '0007_safe.sql'), 'CREATE TABLE safe_x(id TEXT);');
  await fs.writeFile(path.join(root, 'backend', 'migrations', '0008_bad.sql'), 'DROP TABLE users;');
  assert.deepEqual(
    validatePendingMigrationFiles({ repositoryRoot: root, files: ['0007_safe.sql'] }).failures,
    [],
  );
  assert.equal(
    validatePendingMigrationFiles({ repositoryRoot: root, files: ['0008_bad.sql'] }).failures.length,
    1,
  );
  assert.throws(
    () => validatePendingMigrationFiles({ repositoryRoot: root, files: ['../escape.sql'] }),
    /invalid migration filename/i,
  );
  await fs.rm(root, { recursive: true, force: true });
});


test('direct production SQL helpers remain additive-only', async () => {
  const fs = await import('node:fs/promises');
  for (const relative of [
    '../backend/scripts/migrate-reward-ssv.sql',
    '../backend/scripts/migrate-notification-targets.sql',
    '../backend/scripts/migrate-subscription-state.sql',
  ]) {
    const sql = await fs.readFile(new URL(relative, import.meta.url), 'utf8');
    assert.deepEqual(classifyMigrationSql(sql).violations, [], relative);
  }
});
