# Real-Device Play Store Screenshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current synthetic Play phone screenshots with 12 high-contrast 1080×2400 marketing screenshots built from real ADB captures of the current app running on the physical Redmi 5 Plus, without overwriting the production package or changing rollout/subscriptions.

**Architecture:** Add a dedicated `storeQa` Android build type with application id `com.parsfilo.astrology.storeqa`, a QA-only bootstrap activity for language/onboarding seeding, and a purchase-safe deterministic Premium catalogue. ADB captures the actual production UI screens into screenshot-test-only resources; Compose then acts only as a deterministic marketing-frame compositor around those real pixels. Play publication is restricted to `phoneScreenshots`, protected by fresh backup/diff/confirmation/read-back.

**Tech Stack:** Android/Kotlin/Jetpack Compose/Hilt/DataStore/Firebase Android app config, ADB + uiautomator, Node.js ESM contract tooling, Compose Screenshot plugin, Google Play Android Publisher tooling already in `scripts/`.

## Global Constraints

- Physical QA device is the connected Redmi 5 Plus at 1080×2160; do not overwrite or uninstall `com.parsfilo.astrology`.
- QA application id is exactly `com.parsfilo.astrology.storeqa`.
- Normal debug and release package identities remain unchanged when `storeQa` is not built.
- QA capture supports exactly `tr` and `en`; zodiac seed is Aries/Koç.
- Phone screenshot story order is exactly: daily, weekly, monthly, compatibility, profile, premium.
- Final phone screenshots are exactly 1080×2400 PNG.
- Each locale has exactly six phone screenshots.
- Marketing heading text is high-contrast white/off-white, visually dominant at Play thumbnail scale; supporting copy is short and secondary.
- The product capture is the dominant element and is visually enlarged relative to the current synthetic screenshots.
- Raw captures come from the running QA app on the physical device; no synthetic replacement of the app UI is allowed.
- Premium QA mode must not open Google Play purchase UI and must not create purchase/restore side effects.
- QA mode must not initialize/show ads, and must not pollute production analytics/crash reporting.
- Existing icon and feature graphic remain unchanged in this project unless a failing validation proves they must change.
- Play mutation is restricted to `phoneScreenshots`; do not rewrite title, descriptions, icon, feature graphic, rollout, subscriptions, or locale inventory.
- Take a fresh Play backup immediately before publication and another fresh backup immediately after publication.
- Existing production rollout stays `1102 / completed / 1.0`; monthly and weekly subscription contracts stay unchanged.
- All Git author and committer identities are `MakerParsDev <makerpars@gmail.com>` and repository operations target only `MakerParsDev/Astroloji`.

---

## File Structure

**Android QA isolation**
- Modify `Astroloji/app/build.gradle.kts` — define `storeQa` build type, BuildConfig flags, suffix, source-set fallback.
- Create `Astroloji/app/src/storeQa/AndroidManifest.xml` — register QA-only bootstrap activity and disable analytics/crash collection for this build.
- Create `Astroloji/app/src/storeQa/java/com/parsfilo/astrology/storeqa/StoreQaBootstrapActivity.kt` — seed locale/onboarding then launch real `MainActivity`.
- Create `Astroloji/app/src/storeQa/google-services.json` — Firebase Android config for `com.parsfilo.astrology.storeqa`; generated from the same Firebase project, no private key.
- Modify `Astroloji/app/src/main/java/com/parsfilo/astrology/MainActivity.kt` — skip ad/consent startup in `STORE_SCREENSHOT_QA` builds only.

**Premium safety**
- Create `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium/StoreScreenshotQaBilling.kt` — deterministic monthly/weekly display catalogue.
- Modify `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium/PremiumViewModel.kt` — select QA catalogue only when `BuildConfig.STORE_SCREENSHOT_QA`.
- Modify `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/repository/BillingManager.kt` — reject purchase/restore entry points when `STORE_SCREENSHOT_QA` is true.

**Capture pipeline**
- Create `Astroloji/play/assets/source/device-scenes.json` — six scene definitions with locale-specific UI anchors and filenames.
- Create `scripts/capture-store-device-screenshots.mjs` — build/install/start/navigate/wait/capture implementation.
- Create `scripts/store-device-capture-contract.test.mjs` — ADB safety and scene-contract tests.
- Create raw capture resources under `Astroloji/app/src/screenshotTest/res/drawable-nodpi/` named `store_capture_{en|tr}_{daily|weekly|monthly|compatibility|profile|premium}.png`.

**Marketing composition**
- Replace the phone-scene implementation in `Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/store/StoreListingScreenshotTest.kt` — frame real capture resources, not synthetic UI cards.
- Modify `Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/store/StoreScreenshotFixtures.kt` — concise six-story marketing copy only; remove synthetic screen-domain fixture data from phone scenes.
- Modify `Astroloji/play/assets/source/store-scenes.json` — preserve preview-to-output mapping, document `sourceKind: "realDeviceCapture"` for phone scenes.
- Modify `scripts/store-screenshot-contract.test.mjs` — require real capture resources, 360×800dp previews, and reject synthetic phone scene components.

**Asset/export contract**
- Modify `scripts/export-play-assets.mjs` — phone screenshots expect 1080×2400; icon/feature dimensions unchanged.
- Modify `scripts/export-play-assets.test.mjs` — exact 1080×2400 phone assertions.
- Modify `scripts/lib/play-assets.mjs` — `phoneScreenshot` expected size becomes 1080×2400.
- Modify `scripts/play-assets.test.mjs` — fixture dimensions and manifest validation become 1080×2400.
- Update `Astroloji/play/assets/{en-US,tr-TR}/phoneScreenshots/*.png` and `Astroloji/play/asset-manifest.json` only after captures and golden validation pass.

**Publication scope**
- Modify `scripts/lib/play-publication.mjs` — support explicit image-role allowlist.
- Modify `scripts/publish-play-metadata.mjs` — add `--image-scope phoneScreenshots` and reject unsupported scopes.
- Modify `scripts/play-publication.test.mjs` and `scripts/play-cli-arguments.test.mjs` — prove icon/feature/listing text are untouched under phone-only scope.
- Modify `.github/workflows/android-metadata.yml` only if needed to pass the explicit phone-only scope to the existing guarded publication job; do not broaden mutation authority.

**Evidence**
- Create `docs/superpowers/verification/2026-08-07-real-device-play-store-screenshots.md` — device/build/capture hashes, visual QA, CI, backup, publish and read-back evidence.

---

### Task 1: Add an isolated `storeQa` Android build

**Files:**
- Modify: `Astroloji/app/build.gradle.kts`
- Create: `scripts/store-qa-build-contract.test.mjs`
- Create after Firebase provisioning: `Astroloji/app/src/storeQa/google-services.json`

**Interfaces:**
- Consumes: existing `debug` build configuration and `google-services` plugin.
- Produces: Gradle variant `storeQa`, package `com.parsfilo.astrology.storeqa`, `BuildConfig.STORE_SCREENSHOT_QA == true`.

- [ ] **Step 1: Write the failing build-contract test**

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const gradle = fs.readFileSync('Astroloji/app/build.gradle.kts', 'utf8');

test('storeQa is isolated from production package identity', () => {
  assert.match(gradle, /create\("storeQa"\)/);
  assert.match(gradle, /initWith\(getByName\("debug"\)\)/);
  assert.match(gradle, /applicationIdSuffix\s*=\s*"\.storeqa"/);
  assert.match(gradle, /versionNameSuffix\s*=\s*"-storeqa"/);
  assert.match(gradle, /buildConfigField\("boolean",\s*"STORE_SCREENSHOT_QA",\s*"true"\)/);
  assert.doesNotMatch(gradle, /release[\s\S]{0,500}applicationIdSuffix\s*=\s*"\.storeqa"/);
});
```

- [ ] **Step 2: Run RED**

Run:
```bash
node --test scripts/store-qa-build-contract.test.mjs
```
Expected: FAIL because `storeQa` and `STORE_SCREENSHOT_QA` do not exist.

- [ ] **Step 3: Add the minimal build type**

In `Astroloji/app/build.gradle.kts`, add a default false field and a build type equivalent to:

```kotlin
defaultConfig {
    // existing config
    buildConfigField("boolean", "STORE_SCREENSHOT_QA", "false")
}

buildTypes {
    debug {
        // existing debug config unchanged
    }
    create("storeQa") {
        initWith(getByName("debug"))
        matchingFallbacks += listOf("debug")
        applicationIdSuffix = ".storeqa"
        versionNameSuffix = "-storeqa"
        isDebuggable = true
        buildConfigField("boolean", "STORE_SCREENSHOT_QA", "true")
    }
    release {
        // existing release config unchanged
    }
}
```

Do not enable release signing on `storeQa`.

- [ ] **Step 4: Provision the Firebase Android app for the QA package**

First inspect the installed Firebase CLI syntax:
```bash
firebase apps:create --help
firebase apps:sdkconfig --help
```

Create exactly one Android app in Firebase project `makerpars-oaslananka-mobil` with package `com.parsfilo.astrology.storeqa` and display name `Astroloji Store Screenshot QA`. Before creating it, run `firebase apps:list --project makerpars-oaslananka-mobil` and reuse the app if that exact package already exists.

Fetch that app's SDK config into:
```text
Astroloji/app/src/storeQa/google-services.json
```

Acceptance checks:
```bash
node -e 'const j=require("./Astroloji/app/src/storeQa/google-services.json"); const clients=j.client.filter(c=>c.client_info?.android_client_info?.package_name==="com.parsfilo.astrology.storeqa"); if(clients.length!==1) process.exit(1)'
grep -R "PRIVATE KEY" Astroloji/app/src/storeQa/google-services.json && exit 1 || true
```

- [ ] **Step 5: Run GREEN and compile the variant**

```bash
node --test scripts/store-qa-build-contract.test.mjs
cd Astroloji
GRADLE_USER_HOME=/home/msi/.gradle bash ./gradlew :app:assembleStoreQa
```
Expected: test PASS and `app-storeQa.apk` produced; production APK/package untouched.

- [ ] **Step 6: Commit**

```bash
git add Astroloji/app/build.gradle.kts Astroloji/app/src/storeQa/google-services.json scripts/store-qa-build-contract.test.mjs
git commit -m "build(android): add isolated store screenshot QA variant"
```

---

### Task 2: Add QA-only bootstrap and disable capture-time side effects

**Files:**
- Create: `Astroloji/app/src/storeQa/AndroidManifest.xml`
- Create: `Astroloji/app/src/storeQa/java/com/parsfilo/astrology/storeqa/StoreQaBootstrapActivity.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/MainActivity.kt`
- Test: `scripts/store-qa-runtime-contract.test.mjs`

**Interfaces:**
- Consumes: `UserPreferencesRepository.updateOnboarding(Boolean, String, String)` and `AppLanguageManager.applyLanguage(Context, String?)`.
- Produces: exported QA-only component `com.parsfilo.astrology.storeqa.StoreQaBootstrapActivity` accepting `locale=tr|en`; it seeds onboarding complete + Aries then opens the real `MainActivity`.

- [ ] **Step 1: Write the failing runtime contract**

The test must assert all of these literal invariants:

```js
assert.match(manifest, /StoreQaBootstrapActivity/);
assert.match(manifest, /android:exported="true"/);
assert.match(source, /updateOnboarding\(true,\s*"aries",\s*locale\)/);
assert.match(source, /AppLanguageManager\.applyLanguage\(this, locale\)/);
assert.match(mainActivity, /if \(BuildConfig\.STORE_SCREENSHOT_QA\) return/);
assert.match(manifest, /firebase_analytics_collection_enabled/);
assert.match(manifest, /firebase_crashlytics_collection_enabled/);
```

Also assert accepted locales are exactly `{tr,en}` and any other input exits without launching `MainActivity`.

- [ ] **Step 2: Run RED**

```bash
node --test scripts/store-qa-runtime-contract.test.mjs
```
Expected: FAIL because the QA source set does not exist.

- [ ] **Step 3: Implement the QA bootstrap**

`StoreQaBootstrapActivity` behavior:

```kotlin
@AndroidEntryPoint
class StoreQaBootstrapActivity : AppCompatActivity() {
    @Inject lateinit var preferencesRepository: UserPreferencesRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val locale = intent.getStringExtra("locale")?.lowercase()
        if (locale !in setOf("tr", "en")) {
            finishAndRemoveTask()
            return
        }
        lifecycleScope.launch {
            AppLanguageManager.applyLanguage(this@StoreQaBootstrapActivity, locale)
            preferencesRepository.updateOnboarding(true, "aries", locale)
            startActivity(Intent(this@StoreQaBootstrapActivity, MainActivity::class.java))
            finish()
        }
    }
}
```

`src/storeQa/AndroidManifest.xml` must:
- register only this QA bootstrap component,
- disable Firebase Analytics collection,
- disable Crashlytics collection,
- not add a launcher icon/intent-filter for a second visible app entry.

In `MainActivity.launchStartupWork()`, the first statement is:

```kotlin
if (BuildConfig.STORE_SCREENSHOT_QA) return
```

and `onStart()` must resolve app-open policy to false for QA builds without weakening release behavior.

- [ ] **Step 4: Run unit/static GREEN**

```bash
node --test scripts/store-qa-runtime-contract.test.mjs
cd Astroloji
GRADLE_USER_HOME=/home/msi/.gradle bash ./gradlew :app:compileStoreQaKotlin :app:testDebugUnitTest
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Astroloji/app/src/storeQa Astroloji/app/src/main/java/com/parsfilo/astrology/MainActivity.kt scripts/store-qa-runtime-contract.test.mjs
git commit -m "feat(android): add store screenshot QA bootstrap"
```

---

### Task 3: Make Premium deterministic and purchase-safe in QA mode

**Files:**
- Create: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium/StoreScreenshotQaBilling.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium/PremiumViewModel.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/repository/BillingManager.kt`
- Test: `Astroloji/app/src/test/java/com/parsfilo/astrology/feature/premium/StoreScreenshotQaBillingTest.kt`
- Test: `scripts/store-qa-premium-contract.test.mjs`

**Interfaces:**
- Produces: `internal fun storeScreenshotQaPlans(language: String): List<PremiumPlanUi>`.
- Produces: `internal fun resolvePremiumCatalogue(storeScreenshotQa: Boolean, language: String, live: suspend () -> BillingCatalogueLoadResult): BillingCatalogueLoadResult` or an equivalent pure seam used by `PremiumViewModel`.
- Purchase and restore entry points return before calling BillingClient when `BuildConfig.STORE_SCREENSHOT_QA`.

- [ ] **Step 1: Write RED tests**

Kotlin assertions:

```kotlin
val tr = storeScreenshotQaPlans("tr")
assertEquals(listOf("premium_monthly", "premium_weekly"), tr.map { it.productId })
assertEquals(listOf("monthly", "weekly"), tr.map { it.basePlanId })
assertEquals(listOf("P1M", "P1W"), tr.map { it.billingPeriod })
assertEquals("₺394,99", tr[0].price)
assertEquals("₺129,99", tr[1].price)

val en = storeScreenshotQaPlans("en")
assertEquals("$6.99", en[0].price)
assertEquals("$2.29", en[1].price)
```

Static test asserts both `launchPurchase` and restore code contain a QA early-return before any BillingClient call.

- [ ] **Step 2: Run RED**

```bash
node --test scripts/store-qa-premium-contract.test.mjs
cd Astroloji
GRADLE_USER_HOME=/home/msi/.gradle bash ./gradlew :app:testDebugUnitTest --tests '*StoreScreenshotQaBillingTest*'
```
Expected: FAIL because QA billing seam is absent.

- [ ] **Step 3: Implement only the QA seam**

Use the same monthly/weekly cadence contract already covered by production billing tests. The QA catalogue may contain display-only offer tokens because purchase is prohibited in this mode.

`PremiumViewModel.loadCatalogue()` must choose the QA catalogue only when `BuildConfig.STORE_SCREENSHOT_QA`; normal debug/release still call `billingManager.loadPlans()`.

`BillingManager.launchPurchase(...)` and `restorePurchases()` must fail closed in QA mode before BillingClient interaction. Do not emit a fake purchase success.

- [ ] **Step 4: Run GREEN**

```bash
node --test scripts/store-qa-premium-contract.test.mjs
cd Astroloji
GRADLE_USER_HOME=/home/msi/.gradle bash ./gradlew :app:testDebugUnitTest :app:compileStoreQaKotlin
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/repository/BillingManager.kt Astroloji/app/src/test scripts/store-qa-premium-contract.test.mjs
git commit -m "feat(android): make store QA premium capture safe"
```

---

### Task 4: Build a deterministic physical-device capture runner

**Files:**
- Create: `Astroloji/play/assets/source/device-scenes.json`
- Create: `scripts/capture-store-device-screenshots.mjs`
- Create: `scripts/store-device-capture-contract.test.mjs`

**Interfaces:**
- CLI: `node scripts/capture-store-device-screenshots.mjs --serial <adbSerial> --locale tr|en --apk <absoluteApkPath>`.
- Output: six PNG files per locale in `Astroloji/app/src/screenshotTest/res/drawable-nodpi/`.
- QA package: `com.parsfilo.astrology.storeqa`.

- [ ] **Step 1: Write the scene manifest before implementation**

The manifest contains exactly:

```json
{
  "version": 1,
  "packageName": "com.parsfilo.astrology.storeqa",
  "device": { "width": 1080, "height": 2160 },
  "scenes": [
    { "id": "daily", "order": 1 },
    { "id": "weekly", "order": 2 },
    { "id": "monthly", "order": 3 },
    { "id": "compatibility", "order": 4 },
    { "id": "profile", "order": 5 },
    { "id": "premium", "order": 6 }
  ]
}
```

Locale-specific anchor strings belong in the manifest or a typed JS constant, for example `Bugünün Yorumu` / `Today's Reading`, `Uyum Analizi` / `Compatibility Analysis`, `Premium Durumu` / `Premium Status`.

- [ ] **Step 2: Write RED contract tests**

Require the runner to:
- reject an ADB device whose physical size is not 1080×2160,
- verify production package `com.parsfilo.astrology` remains installed before and after capture,
- install only `com.parsfilo.astrology.storeqa`,
- never run `pm clear`, `uninstall`, or `install -r` against the production package,
- accept exactly `tr` or `en`,
- require six scenes in fixed order,
- use `uiautomator dump` text/bounds rather than hard-coded tap coordinates for in-app navigation,
- use `exec-out screencap -p` for raw capture,
- validate each output as 1080×2160 PNG before success.

- [ ] **Step 3: Run RED**

```bash
node --test scripts/store-device-capture-contract.test.mjs
```
Expected: FAIL because runner is absent.

- [ ] **Step 4: Implement the runner**

Core helpers have explicit signatures:

```js
export function parseArgs(argv) -> { serial, locale, apk }
export async function adb(serial, args, options = {}) -> { stdout, stderr }
export function parseBounds(xml, visibleText) -> { left, top, right, bottom }
export async function tapText(serial, visibleText) -> void
export async function waitForText(serial, visibleText, timeoutMs = 15000) -> void
export async function capturePng(serial, destination) -> void
export async function assertPackageInstalled(serial, packageName) -> void
```

For each locale:
1. verify production package exists and record its version/signature snapshot,
2. `adb install -r` only the `storeQa` APK,
3. start `StoreQaBootstrapActivity` with `--es locale tr|en`,
4. wait for Home content,
5. capture daily,
6. navigate using text/bounds to weekly and capture,
7. return Home, navigate to monthly and capture,
8. navigate bottom item compatibility and capture,
9. navigate profile and capture,
10. navigate Premium and capture,
11. verify production package version/signature snapshot is unchanged,
12. leave production package untouched; QA package may remain installed until both locales finish.

- [ ] **Step 5: Run GREEN against fixture/mocked ADB tests**

```bash
node --test scripts/store-device-capture-contract.test.mjs
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add Astroloji/play/assets/source/device-scenes.json scripts/capture-store-device-screenshots.mjs scripts/store-device-capture-contract.test.mjs
git commit -m "feat(play): add physical device screenshot capture runner"
```

---

### Task 5: Replace synthetic phone scenes with real-capture marketing frames

**Files:**
- Modify: `Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/store/StoreListingScreenshotTest.kt`
- Modify: `Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/store/StoreScreenshotFixtures.kt`
- Modify: `Astroloji/play/assets/source/store-scenes.json`
- Modify: `scripts/store-screenshot-contract.test.mjs`
- Create at capture time: 12 PNGs under `Astroloji/app/src/screenshotTest/res/drawable-nodpi/`

**Interfaces:**
- Input resources: `store_capture_{en|tr}_{scene}.png`, each 1080×2160.
- Output previews retain the existing function names such as `StoreDailyEnglishScreenshot()` so exporter mapping remains stable.
- Preview device is exactly `spec:width=360dp,height=800dp,dpi=480`, yielding 1080×2400.

- [ ] **Step 1: Tighten the phone-scene contract to RED**

The contract must require:

```js
assert.match(source, /spec:width=360dp,height=800dp,dpi=480/);
assert.match(source, /painterResource/);
assert.match(source, /ContentScale\.Crop/);
assert.doesNotMatch(source, /InsightMeter\(/);
assert.doesNotMatch(source, /PremiumOfferCard\(/);
assert.doesNotMatch(source, /AstrologyCard\s*\{/);
```

It must require all 12 `store_capture_*` resources and `sourceKind: "realDeviceCapture"` for every phone scene in `store-scenes.json`.

- [ ] **Step 2: Run RED**

```bash
node --test scripts/store-screenshot-contract.test.mjs
```
Expected: FAIL because current phone scenes are synthetic 360×640 Compose screens.

- [ ] **Step 3: Implement one reusable real-capture frame**

Use one reusable composable with explicit arguments:

```kotlin
@Composable
private fun StoreMarketingFrame(
    headline: String,
    supportingText: String,
    @DrawableRes captureRes: Int,
    cropAlignment: Alignment,
)
```

Required composition:
- dark cosmic/brand background may remain,
- headline uses `MaterialTheme.typography.headlineLarge`, `FontWeight.ExtraBold`, and an explicit high-contrast on-dark color,
- supporting text is at most two visible lines,
- captured device image occupies the majority of the frame below copy,
- capture is clipped with a large rounded rectangle and scaled with `ContentScale.Crop`,
- no synthetic domain cards/meters/plans are drawn inside the phone-capture region.

The six Turkish headlines are:
1. `Bugünün burç yorumunu tek bakışta gör`
2. `Haftanın ritmini önceden yakala`
3. `Ayın büyük resmini keşfet`
4. `Burç uyumunu net puanlarla karşılaştır`
5. `Burç profilini kişiselleştir`
6. `Aylık veya haftalık Premium seç`

The six English headlines are:
1. `See today's horoscope at a glance`
2. `See the rhythm of your week ahead`
3. `Explore the bigger picture this month`
4. `Compare zodiac compatibility clearly`
5. `Personalize your zodiac profile`
6. `Choose monthly or weekly Premium`

Supporting copy is one short sentence per scene and must not claim features absent from the captured screen.

- [ ] **Step 4: Compile screenshot tests**

```bash
cd Astroloji
GRADLE_USER_HOME=/home/msi/.gradle bash ./gradlew \
  -Pandroid.experimental.enableScreenshotTest=true \
  :app:compileDebugScreenshotTestKotlin
```
Expected: PASS once raw capture resources exist; before physical capture, missing-resource failure is acceptable and is the explicit handoff to Task 6.

- [ ] **Step 5: Commit source changes, not generated phone assets yet**

```bash
git add Astroloji/app/src/screenshotTest/kotlin Astroloji/play/assets/source/store-scenes.json scripts/store-screenshot-contract.test.mjs
git commit -m "refactor(play): frame store shots from real device captures"
```

---

### Task 6: Capture both locales on the Redmi 5 Plus and generate 12 Play assets

**Files:**
- Create/update: `Astroloji/app/src/screenshotTest/res/drawable-nodpi/store_capture_*.png`
- Modify generated golden references under `Astroloji/app/src/screenshotTestDebug/reference/`
- Modify: `scripts/export-play-assets.mjs`
- Modify: `scripts/export-play-assets.test.mjs`
- Modify: `scripts/lib/play-assets.mjs`
- Modify: `scripts/play-assets.test.mjs`
- Update: `Astroloji/play/assets/en-US/phoneScreenshots/*.png`
- Update: `Astroloji/play/assets/tr-TR/phoneScreenshots/*.png`
- Update: `Astroloji/play/asset-manifest.json`

**Interfaces:**
- Raw capture dimension: 1080×2160.
- Final phone asset dimension: 1080×2400.
- Existing icon 512×512 and feature graphics 1024×500 retain current bytes/hashes.

- [ ] **Step 1: Write RED dimension tests**

Change phone screenshot expectations from 1080×1920 to 1080×2400 in exporter and asset tests. Add a regression assertion that icon and feature graphic expectations remain unchanged.

- [ ] **Step 2: Run RED**

```bash
node --test scripts/export-play-assets.test.mjs scripts/play-assets.test.mjs scripts/store-screenshot-contract.test.mjs
```
Expected: FAIL while current exported phone assets are 1080×1920 and raw captures are absent.

- [ ] **Step 3: Build and inspect the QA APK**

```bash
cd Astroloji
GRADLE_USER_HOME=/home/msi/.gradle bash ./gradlew :app:assembleStoreQa
APK="$PWD/app/build/outputs/apk/storeQa/app-storeQa.apk"
aapt dump badging "$APK" | grep "package: name='com.parsfilo.astrology.storeqa'"
```
Record APK SHA-256 in verification evidence.

- [ ] **Step 4: Capture Turkish then English**

From repo root:

```bash
node scripts/capture-store-device-screenshots.mjs \
  --serial 6bf2d0710005 \
  --locale tr \
  --apk "$APK"

node scripts/capture-store-device-screenshots.mjs \
  --serial 6bf2d0710005 \
  --locale en \
  --apk "$APK"
```

After each run, verify all six raw PNGs are 1080×2160 and no screenshot contains notification shade, permission dialog, toast, ad, loading spinner, error state, personal email, device identifier, or purchase confirmation UI.

- [ ] **Step 5: Generate and validate Compose marketing goldens**

```bash
cd Astroloji
GRADLE_USER_HOME=/home/msi/.gradle bash ./gradlew \
  -Pandroid.experimental.enableScreenshotTest=true \
  :app:updateDebugScreenshotTest

GRADLE_USER_HOME=/home/msi/.gradle bash ./gradlew \
  -Pandroid.experimental.enableScreenshotTest=true \
  :app:validateDebugScreenshotTest
```
Expected: all store + paywall screenshot tests PASS.

- [ ] **Step 6: Export canonical Play assets**

```bash
cd ..
node scripts/export-play-assets.mjs \
  --golden-root Astroloji/app/src/screenshotTestDebug/reference \
  --output-root Astroloji/play/assets
node scripts/validate-play-metadata.mjs
```

Assert:
- 12 phone assets are 1080×2400,
- six per locale,
- icon and feature graphic hashes equal their pre-task hashes,
- manifest phone hashes equal actual bytes.

- [ ] **Step 7: Perform human visual QA at two scales**

Serve only local generated assets on `127.0.0.1` and inspect:
1. full-size images,
2. a browser view with CSS width 180px per screenshot, approximating Play thumbnail scale.

Reject and recapture/reframe any scene where:
- heading is not immediately readable,
- product capture looks smaller than the current store version,
- text inside the product capture is the primary marketing message,
- clipping hides the feature being advertised,
- two adjacent scenes look materially identical,
- Turkish contains English UI labels or English contains Turkish UI labels.

This is a mandatory human gate; automated dimension/hash checks are not a substitute.

- [ ] **Step 8: Run GREEN and commit captures/assets**

```bash
node --test scripts/store-device-capture-contract.test.mjs scripts/store-screenshot-contract.test.mjs scripts/export-play-assets.test.mjs scripts/play-assets.test.mjs
node scripts/validate-play-metadata.mjs
git diff --check
```

Then:
```bash
git add Astroloji/app/src/screenshotTest Astroloji/play/assets Astroloji/play/asset-manifest.json scripts/export-play-assets.mjs scripts/export-play-assets.test.mjs scripts/lib/play-assets.mjs scripts/play-assets.test.mjs
git commit -m "feat(play): replace phone screenshots with real device captures"
```

---

### Task 7: Restrict Play publication to phone screenshot slots

**Files:**
- Modify: `scripts/lib/play-publication.mjs`
- Modify: `scripts/publish-play-metadata.mjs`
- Modify: `scripts/play-publication.test.mjs`
- Modify: `scripts/play-cli-arguments.test.mjs`
- Modify if required: `.github/workflows/android-metadata.yml`

**Interfaces:**
- CLI adds `--image-scope phoneScreenshots`.
- Publication core accepts `imageTypes: Set<'phoneScreenshots'>` or an equivalent explicit allowlist.
- Listing text, icon and feature graphic operations are prohibited in phone-only mode.

- [ ] **Step 1: Add RED mutation-scope tests**

Mock Play client assertions for phone-only mode:

```js
assert.deepEqual(deletedImageTypes, [
  ['en-US', 'phoneScreenshots'],
  ['tr-TR', 'phoneScreenshots'],
]);
assert.equal(iconDeletes, 0);
assert.equal(featureDeletes, 0);
assert.equal(listingPuts, 0);
assert.equal(trackUpdates, 0);
assert.equal(subscriptionCalls, 0);
```

CLI test must reject:
- missing `--image-scope` when running this dedicated screenshot publish path,
- `--image-scope icon`,
- comma lists such as `phoneScreenshots,icon`.

- [ ] **Step 2: Run RED**

```bash
node --test scripts/play-publication.test.mjs scripts/play-cli-arguments.test.mjs
```
Expected: FAIL because publication is not yet phone-only scoped.

- [ ] **Step 3: Implement explicit allowlist**

Do not infer scope from diff. Pass it explicitly from CLI to publication core. In `phoneScreenshots` mode:
- do not call listing PUT,
- do not call icon/feature delete/upload,
- do not touch release notes,
- do not touch tracks/subscriptions/locales.

Keep all existing backup freshness, SHA, live-state digest, confirmation, commit-status authorization and post-commit read-back guards.

- [ ] **Step 4: Run GREEN and workflow lint**

```bash
node --test scripts/play-publication.test.mjs scripts/play-cli-arguments.test.mjs scripts/play-workflow-contract.test.mjs
/tmp/actionlint .github/workflows/android-metadata.yml
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/play-publication.mjs scripts/publish-play-metadata.mjs scripts/play-publication.test.mjs scripts/play-cli-arguments.test.mjs .github/workflows/android-metadata.yml
git commit -m "fix(play): scope store screenshot publication to phone images"
```

---

### Task 8: Full verification, same-repo PR, and controlled Play publication

**Files:**
- Create: `docs/superpowers/verification/2026-08-07-real-device-play-store-screenshots.md`
- No additional product code unless verification exposes a defect.

**Interfaces:**
- Input: final branch with Tasks 1–7.
- Output: merged `MakerParsDev/Astroloji:main`, fresh pre-publish backup, phone-only Play edit, independent read-back, post-publish backup.

- [ ] **Step 1: Run the full local verification on final HEAD**

From repo root:

```bash
node --test scripts/*.test.mjs
node scripts/validate-play-metadata.mjs
git diff --check
```

From `Astroloji/`:

```bash
GRADLE_USER_HOME=/home/msi/.gradle bash ./gradlew \
  :app:testDebugUnitTest \
  detekt \
  ktlintCheck \
  lint \
  :app:assembleDebug \
  :app:assembleStoreQa \
  :app:compileDebugAndroidTestKotlin \
  -Pandroid.experimental.enableScreenshotTest=true \
  :app:validateDebugScreenshotTest
```

Run the existing secret scan and actionlint exactly as CI does. Any failed command blocks PR/publish.

- [ ] **Step 2: Verify physical-device package isolation after capture**

```bash
ADB_SERVER_SOCKET=tcp:127.0.0.1:5037 adb -s 6bf2d0710005 shell dumpsys package com.parsfilo.astrology | grep -E 'versionCode|versionName'
ADB_SERVER_SOCKET=tcp:127.0.0.1:5037 adb -s 6bf2d0710005 shell dumpsys package com.parsfilo.astrology.storeqa | grep -E 'versionCode|versionName'
```

Record production version/signature before and after. They must be identical.

- [ ] **Step 3: Write verification evidence and commit**

Evidence records:
- branch/head SHA,
- all commit authors/committers,
- device serial masked in prose except command evidence if repository convention already permits it,
- production package before/after version + signature fingerprint abbreviation,
- QA APK SHA-256,
- 12 raw capture SHA-256 values,
- 12 final phone screenshot SHA-256 values,
- automated test counts,
- human full-size + 180px thumbnail QA result,
- explicit statement that no real purchase occurred.

Commit:
```bash
git add docs/superpowers/verification/2026-08-07-real-device-play-store-screenshots.md
git commit -m "docs: record real-device store screenshot verification"
```

- [ ] **Step 4: Push only to `MakerParsDev/Astroloji` and open a same-repo PR**

Before push:
```bash
gh api user --jq .login
# expected: MakerParsDev
gh api repos/MakerParsDev/Astroloji --jq '.permissions.push and .permissions.admin'
# expected: true
git remote -v
# expected origin only points at MakerParsDev/Astroloji
```

Push the feature branch. Open `base=main`, `head=MakerParsDev:<branch>`; verify `isCrossRepository=false`, author/head owner MakerParsDev, exact head SHA.

- [ ] **Step 5: Require fresh PR CI and CodeRabbit on exact head**

Accept merge only when the exact final head has successful:
- Android,
- backend,
- secret-scan,
- Semgrep,
- GitGuardian,
- CodeRabbit.

Technically validate every actionable review comment. Fix valid comments TDD-first and restart the exact-head gate.

- [ ] **Step 6: Merge exact head and take a fresh Play backup**

After merge, read `main` SHA from GitHub. Dispatch merged-main metadata `backup` mode with unique correlation. Download private artifact into a mode-0700 directory and chmod backup file 0600.

Fresh backup acceptance:
- locales exactly `en-US`, `tr-TR`,
- production `1102/completed/1.0`,
- subscriptions monthly+weekly unchanged,
- current phone screenshot hashes equal the old six-per-locale set.

- [ ] **Step 7: Run merged-main diff and freeze phone-only confirmation**

The diff must show:
- listing text `UNCHANGED`,
- icon `UNCHANGED`,
- featureGraphic `UNCHANGED`,
- phoneScreenshots `CHANGED` for en-US and tr-TR only,
- rollout `UNCHANGED 1 -> 1`,
- subscriptions `UNCHANGED`,
- `blockingErrors=[]`.

Any other change blocks publication.

- [ ] **Step 8: Publish only `phoneScreenshots`**

Use the existing exact-run correlation + expiring commit-status authorization model. Invoke publication with:

```text
--image-scope phoneScreenshots
```

Authorization is bound to exact merged `main` SHA, exact run ID, `workflow_dispatch`, actor MakerParsDev, UUID correlation and <=5-minute expiry. Close the authorization status as soon as `play-mutation` begins.

- [ ] **Step 9: Independent post-publish read-back and second backup**

Require a separate read-back workflow run and fresh backup after commit. Acceptance:
- locales still exactly en-US + tr-TR,
- six phone screenshots per locale,
- their server/read-back hashes match the new manifest,
- icon and feature hashes unchanged from pre-publish backup,
- listing text unchanged,
- rollout still 1.0/completed,
- subscriptions still monthly+weekly.

- [ ] **Step 10: Public Play thumbnail QA**

After store propagation, open the public listing in Turkish and English contexts and inspect the six screenshot thumbnails. Record whether headings remain readable and the product crop remains legible at carousel scale. If Play compression/cropping materially breaks any image, stop and prepare a new screenshot-only revision rather than changing unrelated metadata.

- [ ] **Step 11: Final report**

Update the verification document with merge SHA, pre/post backup SHA-256, publication run ID, read-back run ID, and public thumbnail QA. Do not claim Data Safety/policy work was part of this screenshot-only project.
