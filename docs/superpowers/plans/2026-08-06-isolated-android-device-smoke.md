# Isolated Android Device Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add and execute a repeatable physical-device smoke test that validates anonymous Firebase authentication, a real Firebase installation ID, production backend registration and JWT refresh, profile authorization, and complete temporary-account deletion without modifying the installed production app or its owner data.

**Architecture:** A standalone `:device-smoke` Android application is the instrumentation target. Its live test initializes a named Firebase application from instrumentation arguments and uses raw OkHttp requests for the backend lifecycle. A host shell runner extracts public Firebase client resources from the installed signed APK, builds and installs only smoke packages, runs the test on one exact ADB serial, redacts output, and always removes the smoke packages.

**Tech Stack:** Android Gradle Plugin 9.3.1, Kotlin 2.4.10, Firebase BOM 34.17.0, Firebase Auth, Firebase Installations, OkHttp 5.4.0, kotlinx.serialization 1.11.0, kotlinx-coroutines-play-services 1.11.0, AndroidX Test 1.7.0/1.3.0, Node test runner for repository contracts.

## Global Constraints

- Never clear, uninstall, replace, inspect private data, or delete the account of `com.parsfilo.astrology`.
- Require one explicit ADB serial and reject empty, wildcard, `all`, and `current` targets.
- Never print Firebase configuration values, ID tokens, backend JWTs, FIDs, Firebase UIDs, or backend user IDs.
- Use only the production backend `https://astrology.parsfilo.com`.
- The temporary user must be deleted during the test and the temporary Firebase installation must be deleted in cleanup.
- Cleanup may uninstall only `com.parsfilo.astrology.devicesmoke` and `com.parsfilo.astrology.devicesmoke.test`.
- All production, backend, lint, formatting, secret-scan, and build gates must remain green.

---

### Task 1: Lock the host safety contract

**Files:**
- Create: `scripts/android-device-smoke-contract.test.mjs`
- Create: `scripts/run-android-device-smoke.sh`

**Interfaces:**
- Consumes: exact ADB serial as argument 1; optional repository root derived from script location.
- Produces: exit code `0` only after a passing instrumentation run and owner-package preservation check.

- [ ] **Step 1: Write the failing contract test**

Create a Node test that reads `scripts/run-android-device-smoke.sh` and requires these literal safety properties:

```js
assert.match(script, /SERIAL="\$\{1:\?Usage:/);
assert.match(script, /adb -s "\$SERIAL"/);
assert.match(script, /com\.parsfilo\.astrology\.devicesmoke/);
assert.match(script, /com\.parsfilo\.astrology\.devicesmoke\.test/);
assert.match(script, /trap cleanup EXIT INT TERM/);
assert.doesNotMatch(script, /pm clear\s+com\.parsfilo\.astrology/);
assert.doesNotMatch(script, /pm uninstall\s+com\.parsfilo\.astrology(?:\s|$)/);
assert.doesNotMatch(script, /run-as\s+com\.parsfilo\.astrology/);
assert.doesNotMatch(script, /\/data\/user\/0\/com\.parsfilo\.astrology/);
assert.match(script, /aapt2 dump resources/);
assert.match(script, /firebaseApiKey/);
assert.match(script, /owner_version_before/);
assert.match(script, /owner_version_after/);
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test scripts/android-device-smoke-contract.test.mjs
```

Expected: FAIL because `scripts/run-android-device-smoke.sh` does not exist.

- [ ] **Step 3: Add the minimal runner skeleton**

Create an executable shell script with strict mode, exact serial validation, constants for the owner and smoke packages, a mode-700 temporary directory, a cleanup trap that uninstalls only the two smoke packages, and owner version snapshots. Do not build or run instrumentation yet.

- [ ] **Step 4: Run the contract test and verify GREEN**

Run the Node test and `shellcheck` when available. Expected: PASS with no shell syntax errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/android-device-smoke-contract.test.mjs scripts/run-android-device-smoke.sh
git commit -m "test(android): lock device smoke safety contract"
```

### Task 2: Add the standalone smoke application module

**Files:**
- Modify: `Astroloji/settings.gradle.kts`
- Modify: `Astroloji/gradle/libs.versions.toml`
- Create: `Astroloji/device-smoke/build.gradle.kts`
- Create: `Astroloji/device-smoke/src/main/AndroidManifest.xml`
- Create: `Astroloji/device-smoke/src/main/res/values/strings.xml`

**Interfaces:**
- Consumes: Firebase and network versions from the version catalog.
- Produces: packages `com.parsfilo.astrology.devicesmoke` and `com.parsfilo.astrology.devicesmoke.test`.

- [ ] **Step 1: Extend the contract test with module requirements**

Require `include(":device-smoke")`, application ID `com.parsfilo.astrology.devicesmoke`, `minSdk = 24`, `targetSdk = 37`, AndroidJUnitRunner, and direct `firebase-installations` dependency.

- [ ] **Step 2: Run the contract test and verify RED**

Expected: FAIL because the module is absent.

- [ ] **Step 3: Add the minimal module**

Use `com.android.application` and `org.jetbrains.kotlin.plugin.serialization`. Configure namespace/application ID, SDK levels, Java/Kotlin 21, no release signing, `android:allowBackup="false"`, and no launcher activity. Add implementation dependencies for Firebase Auth, Firebase Installations, OkHttp, Kotlin serialization JSON, and coroutines Play Services. Add androidTest dependencies for AndroidX JUnit, runner, rules, and Truth.

- [ ] **Step 4: Compile the module**

Run:

```bash
cd Astroloji
./gradlew :device-smoke:assembleDebug :device-smoke:assembleDebugAndroidTest
```

Expected: both APKs are produced.

- [ ] **Step 5: Commit**

```bash
git add Astroloji/settings.gradle.kts Astroloji/gradle/libs.versions.toml Astroloji/device-smoke
git commit -m "test(android): add isolated device smoke module"
```

### Task 3: Implement the live lifecycle test with RED-first helpers

**Files:**
- Create: `Astroloji/device-smoke/src/main/java/com/parsfilo/astrology/devicesmoke/SmokeArguments.kt`
- Create: `Astroloji/device-smoke/src/test/java/com/parsfilo/astrology/devicesmoke/SmokeArgumentsTest.kt`
- Create: `Astroloji/device-smoke/src/androidTest/java/com/parsfilo/astrology/devicesmoke/BackendSmokeClient.kt`
- Create: `Astroloji/device-smoke/src/androidTest/java/com/parsfilo/astrology/devicesmoke/LiveIdentityLifecycleSmokeTest.kt`

**Interfaces:**
- `SmokeArguments.from(Map<String, String>): SmokeArguments`
- `BackendSmokeClient.register(firebaseIdToken: String, fid: String): RegisteredIdentity`
- `BackendSmokeClient.profile(jwt: String): ProfileSnapshot`
- `BackendSmokeClient.refresh(jwt: String): String`
- `BackendSmokeClient.delete(jwt: String): DeleteSnapshot`
- `BackendSmokeClient.profileStatus(jwt: String): Int`

- [ ] **Step 1: Write failing argument validation tests**

Test that missing values, oversized values, non-HTTPS backend URLs, and non-production backend hosts are rejected. Test that valid bounded maps are accepted without exposing their values in `toString()`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run `./gradlew :device-smoke:testDebugUnitTest` and confirm unresolved `SmokeArguments` symbols.

- [ ] **Step 3: Implement minimal argument validation**

Require non-blank map values with maximum lengths: API key 128, app ID 128, project ID 128, sender ID 32, backend URL 128. Require the exact backend origin `https://astrology.parsfilo.com`. The instrumentation test converts its argument `Bundle` to this map before validation.

- [ ] **Step 4: Implement the backend client**

Use one OkHttp client with a 20-second call timeout. Encode requests with kotlinx.serialization. Never log request bodies, response bodies, or authorization headers. On unexpected status, throw `SmokeStageException(stage, statusCode)` with no response body.

- [ ] **Step 5: Implement the live test**

In one `@Test(timeout = 120_000)` method:

```kotlin
val app = FirebaseApp.initializeApp(context, options, "device-smoke-${System.nanoTime()}")!!
val auth = FirebaseAuth.getInstance(app)
val installations = FirebaseInstallations.getInstance(app)
try {
    val user = auth.signInAnonymously().await().user ?: error("anonymous user missing")
    val firebaseToken = user.getIdToken(true).await().token ?: error("firebase token missing")
    val fid = installations.id.await().trim().also { require(it.isNotEmpty()) }
    val registered = client.register(firebaseToken, fid)
    val firstProfile = client.profile(registered.jwt)
    val refreshedJwt = client.refresh(registered.jwt)
    val secondProfile = client.profile(refreshedJwt)
    val deleted = client.delete(refreshedJwt)
    assertThat(deleted.ok).isTrue()
    assertThat(deleted.firebaseAccountDeleted).isTrue()
    assertThat(client.profileStatus(refreshedJwt)).isAnyOf(401, 404)
} finally {
    runCatching { installations.delete().await() }
    auth.signOut()
    app.delete()
}
```

Assert sign/language/profile consistency and non-empty opaque identifiers without printing them.

- [ ] **Step 6: Compile and run static checks**

Run ktlint, detekt where applicable, and both smoke APK assembly tasks. Expected: GREEN.

- [ ] **Step 7: Commit**

```bash
git add Astroloji/device-smoke/src/androidTest
git commit -m "test(android): exercise live identity lifecycle"
```

### Task 4: Complete the host runner

**Files:**
- Modify: `scripts/run-android-device-smoke.sh`
- Modify: `scripts/android-device-smoke-contract.test.mjs`

**Interfaces:**
- Reads public resource values from the owner APK with `aapt2 dump resources`.
- Passes values only through `am instrument -e` arguments.
- Writes a bounded `DEVICE_SMOKE_PASS` or `DEVICE_SMOKE_FAIL stage=<name> class=<type> status=<code>` summary.

- [ ] **Step 1: Add failing contract assertions**

Require device-state validation, installed owner-package validation, resource-name extraction for `google_api_key`, `google_app_id`, `project_id`, and `gcm_defaultSenderId`, mode-600 instrumentation log, smoke-only install/uninstall, and owner certificate/version comparison.

- [ ] **Step 2: Run and verify RED**

Expected: FAIL because the runner skeleton lacks the complete flow.

- [ ] **Step 3: Implement public-resource extraction**

Pull only the base APK returned by `pm path`. Parse the value immediately following each exact resource declaration from `aapt2 dump resources`. Keep values in shell variables and never echo them.

- [ ] **Step 4: Implement build, install, run, and cleanup**

Build the two debug APKs, uninstall stale smoke packages, install the smoke target and test APKs with exact serial targeting, and run:

```bash
adb -s "$SERIAL" shell am instrument -w -r \
  -e firebaseApiKey "$firebase_api_key" \
  -e firebaseAppId "$firebase_app_id" \
  -e firebaseProjectId "$firebase_project_id" \
  -e firebaseSenderId "$firebase_sender_id" \
  -e backendBaseUrl "https://astrology.parsfilo.com" \
  com.parsfilo.astrology.devicesmoke.test/androidx.test.runner.AndroidJUnitRunner
```

Capture output to the private temporary log, require `OK (1 test)`, compare owner version and certificate before/after, print one bounded pass line, and let the trap remove smoke packages and temporary files.

- [ ] **Step 5: Verify contract and dry failure modes**

Run the Node contract test, call the runner with no serial and an invalid serial, and verify it fails before any install.

- [ ] **Step 6: Commit**

```bash
git add scripts/run-android-device-smoke.sh scripts/android-device-smoke-contract.test.mjs
git commit -m "test(android): run isolated physical device smoke"
```

### Task 5: Add compile-only CI coverage

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/android-quality-gates.test.mjs`

**Interfaces:**
- CI compiles both smoke APKs but never executes live backend operations.

- [ ] **Step 1: Add a failing root contract**

Require a CI step named `Device smoke APK compile` running `./gradlew :device-smoke:assembleDebug :device-smoke:assembleDebugAndroidTest`.

- [ ] **Step 2: Run and verify RED**

Expected: root Node contract test fails.

- [ ] **Step 3: Add the CI compile step**

Place it after Android unit tests and before debug assembly. Do not add Firebase credentials, device execution, artifact upload, or production signing.

- [ ] **Step 4: Run root and Android verification**

Run all root Node tests, secret scan, smoke module assembly, app detekt/ktlint/lint/unit tests, screenshot validation, debug APK, and release AAB dry-run with Crashlytics upload disabled.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml scripts/android-quality-gates.test.mjs
git commit -m "ci(android): compile physical device smoke suite"
```

### Task 6: Execute physical-device acceptance and close the branch

**Files:**
- No source changes expected.
- Evidence: `/tmp/astro-device-smoke-evidence.txt` with mode 600 and bounded values only.

**Interfaces:**
- Device serial: `6bf2d0710005`.
- Owner package: `com.parsfilo.astrology`.

- [ ] **Step 1: Snapshot owner state**

Record package version, signing SHA-256, resolved activity, and a UI tree summary without private application data.

- [ ] **Step 2: Run the smoke suite**

```bash
scripts/run-android-device-smoke.sh 6bf2d0710005
```

Expected: `DEVICE_SMOKE_PASS stages=anonymous_auth,fid,register,profile,refresh,delete,post_delete`.

- [ ] **Step 3: Verify cleanup and owner preservation**

Require both smoke packages absent, owner version and signing digest unchanged, owner app launchable, no crash/ANR, and no `session expired` screen.

- [ ] **Step 4: Run final repository verification**

Run the complete root, backend, Android, screenshot, lint, format, audit, and build gates from a clean tree.

- [ ] **Step 5: Final commit if evidence documentation changed**

Do not commit tokens, identifiers, device logs, APKs, test reports, or Firebase values. Commit only durable source/test/docs changes.
