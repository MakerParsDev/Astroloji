import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const manifestPath = 'Astroloji/app/src/storeQa/AndroidManifest.xml';
const sourcePath = 'Astroloji/app/src/storeQa/java/com/parsfilo/astrology/storeqa/StoreQaBootstrapActivity.kt';
const mainActivityPath = 'Astroloji/app/src/main/java/com/parsfilo/astrology/MainActivity.kt';

const read = (path) => fs.readFileSync(path, 'utf8');

test('storeQa runtime is deterministic and side-effect isolated', () => {
  const manifest = read(manifestPath);
  const source = read(sourcePath);
  const mainActivity = read(mainActivityPath);

  assert.match(manifest, /StoreQaBootstrapActivity/);
  assert.match(manifest, /android:exported="true"/);
  assert.match(source, /updateOnboarding\(true,\s*"aries",\s*locale\)/);
  assert.match(source, /AppLanguageManager\.applyLanguage\(this@StoreQaBootstrapActivity, locale\)/);
  assert.match(mainActivity, /private fun launchStartupWork\(\) \{\s*if \(BuildConfig\.STORE_SCREENSHOT_QA\) return/);
  assert.match(manifest, /firebase_analytics_collection_enabled/);
  assert.match(manifest, /firebase_crashlytics_collection_enabled/);
  assert.match(source, /setOf\("tr",\s*"en"\)/);

  const invalidLocale = source.match(/if \(locale !in setOf\("tr",\s*"en"\)\) \{([\s\S]*?)\n\s*\}/);
  assert.ok(invalidLocale, 'invalid locale guard must exist');
  assert.match(invalidLocale[1], /finishAndRemoveTask\(\)/);
  assert.doesNotMatch(invalidLocale[1], /startActivity\(/);
  assert.match(mainActivity, /shouldShowAppOpen\s*=\s*if \(BuildConfig\.STORE_SCREENSHOT_QA\)\s*(?:\{\s*)?false/);
});
