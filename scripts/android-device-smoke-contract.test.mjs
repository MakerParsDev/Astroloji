import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const runnerPath = new URL('./run-android-device-smoke.sh', import.meta.url);

test('device smoke runner is exact-targeted and preserves the owner app', () => {
  assert.equal(existsSync(runnerPath), true, 'device smoke runner must exist');
  const script = readFileSync(runnerPath, 'utf8');

  assert.match(script, /SERIAL="\$\{1:\?Usage:/);
  assert.match(script, /adb -s "\$SERIAL"/);
  assert.match(script, /OWNER_PACKAGE="com\.parsfilo\.astrology"/);
  assert.match(script, /SMOKE_PACKAGE="com\.parsfilo\.astrology\.devicesmoke"/);
  assert.match(script, /SMOKE_TEST_PACKAGE="com\.parsfilo\.astrology\.devicesmoke\.test"/);
  assert.match(script, /trap cleanup EXIT INT TERM/);
  assert.match(script, /owner_version_before/);
  assert.match(script, /owner_version_after/);
  assert.match(script, /aapt2 dump resources/);
  assert.match(script, /firebaseApiKey/);

  assert.doesNotMatch(script, /pm clear\s+com\.parsfilo\.astrology/);
  assert.doesNotMatch(script, /pm uninstall\s+com\.parsfilo\.astrology(?:\s|$)/);
  assert.doesNotMatch(script, /run-as\s+com\.parsfilo\.astrology/);
  assert.doesNotMatch(script, /\/data\/user\/0\/com\.parsfilo\.astrology/);
});
