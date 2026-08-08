import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const activeFiles = [
  'backend/src/middleware/auth.ts',
  'backend/src/types.ts',
  'backend/scripts/shared.ts',
  '.github/workflows/backend-production-deploy.yml',
  'README.md',
  'backend/README.md',
  'RELEASE_RUNBOOK.md'
];

const read = (path) => readFileSync(path, 'utf8');

test('active configuration has no legacy admin credential', () => {
  const active = activeFiles.map((path) => `${path}\n${read(path)}`).join('\n');
  assert.doesNotMatch(active, /\bADMIN_SECRET\b/);
  assert.doesNotMatch(active, /secrets\.ADMIN_SECRET/);
  assert.doesNotMatch(active, /wrangler\s+secret\s+put\s+ADMIN_SECRET/);
});

test('generic allowlist excludes admin credentials', () => {
  const shared = read('backend/scripts/shared.ts');
  const match = shared.match(/CLOUDFLARE_SECRET_NAMES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  assert.ok(match);
  assert.doesNotMatch(match[1], /ADMIN_SECRET|ADMIN_CONTENT_SECRET|ADMIN_NOTIFICATION_SECRET|ADMIN_PLAY_READ_SECRET|ADMIN_PLAY_WRITE_SECRET/);
});

test('obsolete broad admin-secret sync workflow is absent', () => {
  assert.equal(existsSync('.github/workflows/backend-admin-secret-sync.yml'), false);
});
