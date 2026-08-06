import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const schema = readFileSync('backend/schema.sql', 'utf8');
const migration = readFileSync('backend/migrations/0001_notification_targets.sql', 'utf8');
const wrangler = readFileSync('backend/wrangler.toml', 'utf8');
const workflow = readFileSync('.github/workflows/backend-production-deploy.yml', 'utf8');
const manifest = readFileSync('Astroloji/app/src/main/AndroidManifest.xml', 'utf8');
const repository = readFileSync(
  'Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/repository/SessionRepository.kt',
  'utf8',
);
const service = readFileSync(
  'Astroloji/app/src/main/java/com/parsfilo/astrology/notification/AstrologyFirebaseMessagingService.kt',
  'utf8',
);

test('notification storage distinguishes legacy tokens from FIDs', () => {
  assert.match(schema, /target_type TEXT NOT NULL DEFAULT 'token'/);
  assert.match(migration, /ALTER TABLE fcm_tokens\s+ADD COLUMN target_type TEXT NOT NULL DEFAULT 'token'/);
  assert.match(migration, /CHECK \(target_type IN \('token', 'fid'\)\)/);
});



test('migration backfills existing rows as legacy tokens in SQLite', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'astrology-fid-migration-'));
  const database = path.join(directory, 'migration.db');
  const bootstrap = path.join(directory, 'bootstrap.sql');
  writeFileSync(
    bootstrap,
    `CREATE TABLE fcm_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL DEFAULT 'android',
      notification_enabled INTEGER NOT NULL DEFAULT 1,
      notification_hour INTEGER NOT NULL DEFAULT 9,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO fcm_tokens VALUES ('row-1', 'user-1', 'legacy-token', 'android', 1, 9, 'now', 'now');`
  );

  try {
    const apply = spawnSync('sqlite3', [database], {
      input: `${readFileSync(bootstrap, 'utf8')}
${migration}`,
      encoding: 'utf8'
    });
    assert.equal(apply.status, 0, apply.stderr);
    const query = spawnSync(
      'sqlite3',
      [database, "SELECT token || '|' || target_type FROM fcm_tokens;"],
      { encoding: 'utf8' }
    );
    assert.equal(query.status, 0, query.stderr);
    assert.equal(query.stdout.trim(), 'legacy-token|token');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('production applies the notification target migration before deployment', () => {
  assert.match(wrangler, /migrations_dir = \"migrations\"/);
  const migrationStep = workflow.indexOf('npx wrangler d1 migrations apply astrology-db --remote');
  const deployStep = workflow.indexOf('npm run deploy:doppler');
  assert.notEqual(migrationStep, -1);
  assert.notEqual(deployStep, -1);
  assert.ok(migrationStep < deployStep);
});

test('Android enables FID delivery and uses the registration callback', () => {
  assert.match(manifest, /firebase_messaging_installation_id_enabled/);
  assert.match(manifest, /android:value="true"/);
  assert.match(service, /override fun onRegistered\(installationId: String\)/);
  assert.match(service, /@Deprecated\([\s\S]*Compatibility callback for Android Lint[\s\S]*override fun onNewToken\(token: String\)/);
  assert.doesNotMatch(service, /@Suppress\("DEPRECATION"\)/);
  assert.match(service, /token is used only as a refresh signal/);
  assert.doesNotMatch(service, /fcmToken\s*=\s*token|firebaseInstallationId\s*=\s*token/);
  assert.doesNotMatch(repository, /deleteToken\(|\.token\s*\.await/);
  assert.match(repository, /pushRegistrationManager\.register\(\)/);
  assert.match(repository, /pushRegistrationManager\.unregister\(\)/);
});
