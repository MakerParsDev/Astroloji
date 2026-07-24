# Remove Plaintext Fallback Credentials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove reusable fallback passwords from Android application storage and recover sessions only through Firebase-managed state or anonymous authentication.

**Architecture:** Register an idempotent Preferences DataStore migration that deletes the two legacy fallback credential fields before normal reads. Remove all email/password fallback generation and persistence from `SessionRepository`, retain Firebase current-user and anonymous-auth recovery, and make session cleanup defensively remove legacy fields.

**Tech Stack:** Kotlin 2.4.10, AndroidX DataStore Preferences 1.2.1, Firebase Auth, Coroutines, JUnit 4, MockK, Truth, Robolectric.

## Global Constraints

- Do not add dependencies.
- Write failing tests before behavior changes.
- Never log, document, or commit credential values.
- Preserve unrelated DataStore preferences during migration and logout.
- Account deletion must continue to clear all local application state only after backend success.

---

### Task 1: Legacy DataStore Migration

**Files:**
- Create: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/preferences/LegacyCredentialMigration.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/preferences/PreferencesStore.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/preferences/UserPreferencesRepository.kt`
- Create: `Astroloji/app/src/test/java/com/parsfilo/astrology/core/data/preferences/LegacyCredentialMigrationTest.kt`

**Interfaces:**
- Produces: `RemoveLegacyFallbackCredentialsMigration : DataMigration<Preferences>`
- Produces: `MutablePreferences.removeLegacyFallbackCredentials()` for defensive session cleanup.

- [ ] Write tests proving migration detection, deletion of both legacy fields, preservation of unrelated preferences, and idempotence.
- [ ] Run only `LegacyCredentialMigrationTest` and verify it fails before implementation.
- [ ] Implement the migration and register it through `preferencesDataStore(produceMigrations = ...)`.
- [ ] Remove public production read/write APIs for fallback credentials and invoke legacy removal from `clearSession()`.
- [ ] Run the focused migration test and verify it passes.
- [ ] Commit the migration change.

### Task 2: Credential-Free Firebase Recovery

**Files:**
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/repository/SessionRepository.kt`
- Modify: `Astroloji/app/src/test/java/com/parsfilo/astrology/core/data/repository/SessionRepositoryRefreshTest.kt`

**Interfaces:**
- Retains: `refreshSessionToken(forceRefreshFirebaseToken: Boolean): AppResult<String>`
- Retains: `refreshAfterUnauthorized(rejectedToken: String?): AppResult<String>`
- Removes: generated email/password sign-in, account creation, and fallback credential persistence.

- [ ] Add tests for an existing Firebase user, anonymous sign-in when no user exists, and anonymous-auth failure without any email/password call.
- [ ] Run the focused repository tests and verify the new cases fail against the current fallback implementation.
- [ ] Simplify `ensureFirebaseIdToken()` to current-user or anonymous-auth recovery only.
- [ ] Delete credential generation, email/password sign-in/account creation, and Firebase error-code fallback helpers.
- [ ] Run the focused repository tests and verify they pass.
- [ ] Commit credential-free recovery.

### Task 3: Cleanup Verification

**Files:**
- Modify: `Astroloji/app/src/test/java/com/parsfilo/astrology/core/data/repository/SessionRepositoryRefreshTest.kt`
- Modify: `Astroloji/app/src/test/java/com/parsfilo/astrology/core/data/repository/SessionRepositoryDeletionTest.kt`

**Interfaces:**
- Verifies: invalid-session cleanup clears DataStore session state, Room profile cache, Firebase local session, and the in-memory app token.
- Verifies: successful account deletion clears DataStore, Room, Firebase local session, and the in-memory app token.

- [ ] Strengthen logout/invalidation tests to assert all cleanup collaborators and in-memory token state.
- [ ] Strengthen account-deletion tests to assert the token store is cleared only after backend success.
- [ ] Run both focused test classes and verify all cases pass.
- [ ] Commit cleanup coverage.

### Task 4: Repository Verification and Delivery

**Files:**
- Modify only if required by verification findings.

- [ ] Search tracked source for legacy key names, credential persistence APIs, password-based Firebase calls, and credential-shaped logging.
- [ ] Run `git diff --check` and a secret scan over the changed diff.
- [ ] Run Detekt, ktlint, and all Android unit tests.
- [ ] Build debug APK and release AAB dry-run.
- [ ] Push with the verified `MakerParsDev` GitHub identity and open a PR closing issue #3.
- [ ] Require successful PR CI, Semgrep, CodeRabbit, and internal preflight on the exact PR head SHA.
- [ ] Squash merge only when the PR is clean and all review threads are resolved.
- [ ] Verify issue #3 closes and the resulting `main` CI succeeds.
