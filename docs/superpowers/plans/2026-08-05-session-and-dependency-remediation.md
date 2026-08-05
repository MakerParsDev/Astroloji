# Session and Dependency Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:systematic-debugging for the session incident, superpowers:test-driven-development for behavior changes, and superpowers:verification-before-completion before declaring completion.

**Goal:** Remove known backend dependency vulnerabilities and prove that the current Android source recovers an expired session against the production Firebase/backend stack without modifying the installed production app.

**Architecture:** Dependency remediation is isolated to exact package pins, audited transitive overrides, generated Worker types, and the npm lockfile, with `npm audit` as the failing security gate and the existing build/runtime suites as regression gates. Session diagnosis compares the current source contract with production behavior using an isolated emulator when available, otherwise a temporary anonymous Firebase/backend smoke account that is deleted in the same run. Production session code changes are allowed only if evidence exposes a current-source defect; deployment drift is corrected through the guarded GitHub Actions production workflow.

**Tech Stack:** Node.js 24, npm 10, Hono, Wrangler, Vitest, Kotlin 2.4, Jetpack Compose, Firebase Auth, Gradle 9.6.1, ADB/Android Emulator.

## Global Constraints

- Do not print or commit secrets, Firebase client values, signing material, tokens, or production user data.
- Do not uninstall, overwrite, clear, or resign the application currently installed on the physical phone.
- Keep exact dependency pins and update `AGENTS.md` when approved dependency versions change.
- Write and observe a failing test before any Android production behavior change.
- Run the complete backend and Android verification chains after modifications.

---

### Task 1: Backend Dependency Security Gate

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Existing npm audit report and exact dependency policy.
- Produces: A lockfile with no high-severity audit findings and exact safe Hono/Wrangler pins.

- [ ] **Step 1: Run the failing security gate**

Run:

```sh
cd backend
npm ci
npm audit --audit-level=high
```

Expected: non-zero exit with Hono/Wrangler-related findings.

- [ ] **Step 2: Update only the required exact pins**

Set `hono` to the first audited safe compatible version and `wrangler` to the audited safe compatible version, regenerate `package-lock.json`, and update the approved dependency table in `AGENTS.md` with the reason.

- [ ] **Step 3: Verify the focused gate**

Run:

```sh
cd backend
npm audit --audit-level=high
npm run build
npm test
npm run test:runtime
npm run build:transition
npm run test:runtime:transition
```

Expected: all commands succeed.

### Task 2: Android Session Runtime Diagnosis

**Files:**
- Temporary only: `/tmp/astro-installed-resources.txt`
- Temporary only: `Astroloji/app/google-services.json`
- No production source file unless a new defect is proven.

**Interfaces:**
- Consumes: Public Firebase client resources from the installed APK and current Android source.
- Produces: Runtime evidence showing whether current source can anonymously authenticate, register, refresh JWT, and load Home content.

- [ ] **Step 1: Attempt an isolated emulator, then use the bounded fallback if unavailable**

Install a temporary Android 32 Google APIs system image under `/tmp`, create an AVD, and boot it without using the physical phone. If the host lacks a reliable emulator path, use the installed APK only to extract public Firebase client resources and run an ephemeral anonymous Firebase/backend smoke account that is deleted before the command exits.

- [ ] **Step 2: Reconstruct temporary Firebase client config**

Extract `google_app_id`, `google_api_key`, `gcm_defaultSenderId`, `project_id`, and `google_storage_bucket` from the installed APK. Write a valid temporary `google-services.json`; never print or commit its values.

- [ ] **Step 3: Build and install current debug source**

Run:

```sh
cd Astroloji
./gradlew :app:assembleDebug
adb -s <emulator> install -r app/build/outputs/apk/debug/app-debug.apk
```

Expected: build and installation succeed.

- [ ] **Step 4: Exercise and classify session recovery**

Launch the isolated app when possible. In all cases, verify anonymous Firebase signup, backend registration without an FCM token, profile load, content load, JWT refresh, refreshed profile load, and account cleanup. Compare any failing production response with the current validator and route tests to distinguish an Android defect from production deployment drift.

- [ ] **Step 5: Apply TDD only if runtime evidence proves a current-source defect**

Add one minimal failing regression test, observe the expected failure, implement one root-cause fix, and rerun the focused test before the full Android chain.


### Task 3: Production Deployment Drift Remediation

**Files:**
- No direct production file edits; deploy only a CI-verified `main` commit through `.github/workflows/backend-production-deploy.yml`.

**Interfaces:**
- Consumes: A merged commit whose tests prove registration without `fcm_token` is valid.
- Produces: A production Worker matching `main`, followed by a live disposable-account smoke result.

- [ ] **Step 1: Push the isolated branch and require CI**

Push the branch, open a pull request, and wait for `secret-scan`, `backend-verify`, and `android-verify` to succeed.

- [ ] **Step 2: Validate signed Android release inputs without publishing**

Dispatch `android-internal-preflight.yml` with `confirm=PREFLIGHT` on the branch and require the Doppler, Firebase, Play, AdMob, keystore, and signed-AAB checks to pass.

- [ ] **Step 3: Merge and deploy guarded main**

Merge only after all checks pass, then dispatch `backend-production-deploy.yml` from `main` with `confirm=DEPLOY` and wait for successful live endpoint verification.

- [ ] **Step 4: Verify the fixed production contract**

Repeat the disposable Firebase/backend smoke without `fcm_token`. Require HTTP 200 for registration and refresh, then delete both backend and Firebase accounts. Relaunch the physical app without clearing data and test the existing retry action.

### Task 4: Full Verification and Delivery

**Files:**
- Verify all modified files and generated lockfile metadata.

**Interfaces:**
- Consumes: Tasks 1 and 2 results.
- Produces: A clean branch, reproducible verification evidence, and a patch/commit ready for upstream delivery.

- [ ] **Step 1: Run Android verification**

```sh
cd Astroloji
./gradlew :app:detekt :app:ktlintCheck :app:testDebugUnitTest :app:assembleDebug :app:bundleRelease
```

Expected: success with zero test failures.

- [ ] **Step 2: Check repository hygiene**

Confirm temporary Firebase files, APKs, AABs, secrets, and emulator state are not staged. Run the repository secret scanner.

- [ ] **Step 3: Commit the verified remediation**

Commit only dependency, lockfile, documentation, and any test-first root-cause fix. Preserve the physical device installation and report any upstream authentication limitation honestly.
