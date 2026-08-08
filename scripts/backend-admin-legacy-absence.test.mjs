import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);

function isActiveLegacyScanPath(path) {
  if (path.startsWith('backend/src/')) return true;
  if (path.startsWith('backend/scripts/')) return true;
  if (path.startsWith('.github/workflows/')) return true;
  if (/^backend\/wrangler(?:\.[^.]+)?\.toml$/.test(path)) return true;
  if (path === 'backend/worker-configuration.d.ts') return true;
  if (path.startsWith('scripts/') && path.endsWith('.mjs') && !path.endsWith('.test.mjs') && path !== 'scripts/scan-secrets.mjs') return true;
  return ['README.md', 'backend/README.md', 'RELEASE_RUNBOOK.md'].includes(path);
}

const activeFiles = trackedFiles.filter(isActiveLegacyScanPath);
const read = (path) => readFileSync(path, 'utf8');

test('active configuration has no legacy admin credential', () => {
  assert.ok(activeFiles.includes('backend/src/index.ts'));
  assert.ok(activeFiles.includes('backend/src/workers/notification.ts'));
  assert.ok(activeFiles.includes('.github/workflows/backend-admin-capability-sync.yml'));
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
