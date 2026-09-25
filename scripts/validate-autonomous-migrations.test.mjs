import assert from 'node:assert/strict';
import test from 'node:test';

import { validateMigrationChange, classifyMigrationSql } from './validate-autonomous-migrations.mjs';

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
    'TRUNCATE TABLE users;',
    'DELETE FROM users;',
    'UPDATE users SET name = "x";',
    'ALTER TABLE users DROP COLUMN name;',
    'ALTER TABLE users RENAME TO old_users;',
    'REPLACE INTO settings(key, value) VALUES ("v", "2");',
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
