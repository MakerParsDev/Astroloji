# Account and Data Deletion Implementation Plan

> Execute this plan test-first in the isolated `feat/account-data-deletion-20260720` worktree.

## Task 1: Backend Firebase deletion service

**Files**
- Create: `backend/src/services/firebaseAuth.ts`
- Create: `backend/tests/services/firebaseAuth.test.ts`

**Steps**
1. Add failing tests for correct Identity Toolkit request, idempotent `USER_NOT_FOUND`, and safe failure.
2. Run the targeted test and confirm failure.
3. Implement project ID extraction, OAuth token creation, and delete request.
4. Run targeted test and confirm success.

## Task 2: Backend account deletion route

**Files**
- Modify: `backend/src/workers/user.ts`
- Modify: `backend/tests/workers/user.test.ts`
- Modify: `backend/tests/workers/app.test.ts`

**Steps**
1. Add failing tests for authenticated deletion SQL/KV/Firebase behavior, missing Firebase UID, and unauthenticated access.
2. Run targeted tests and confirm failure.
3. Implement D1 batch deletion, reward-prefix KV cleanup, Firebase deletion, and safe responses.
4. Run targeted tests and confirm success.

## Task 3: Public deletion page

**Files**
- Modify: `backend/src/pages/legal.ts`
- Modify: `backend/src/index.ts`
- Modify: `backend/tests/workers/app.test.ts`

**Steps**
1. Add failing `/delete-account` page test.
2. Implement page and route using the existing hardened legal response helper.
3. Run targeted tests.

## Task 4: Android API and local reset

**Files**
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/remote/AstrologyApi.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/preferences/UserPreferencesRepository.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/repository/SessionRepository.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/local/AstrologyDatabase.kt`
- Create: `Astroloji/app/src/test/java/com/parsfilo/astrology/core/data/repository/SessionRepositoryDeletionTest.kt`

**Steps**
1. Add failing repository tests for success cleanup and failure preservation.
2. Add Retrofit delete response/method.
3. Add DataStore `clearAll()`.
4. Inject `AstrologyDatabase`, call backend, sign out, delete FCM token best-effort, clear Room/DataStore.
5. Run targeted Android tests.

## Task 5: Android Settings UI and navigation

**Files**
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/settings/SettingsViewModel.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/settings/SettingsScreen.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/navigation/AstrologyAppRoot.kt`
- Create: `Astroloji/app/src/test/java/com/parsfilo/astrology/feature/settings/SettingsViewModelTest.kt`
- Modify: string resources in `values`, `values-en`, and `values-tr`

**Steps**
1. Add failing ViewModel tests for confirmation, progress/success effect, and failure.
2. Implement state/events/effect.
3. Add confirmation dialog and destructive card.
4. Collect effect and navigate to onboarding with cleared back stack.
5. Run targeted tests, ktlint, and detekt.

## Task 6: Full verification and delivery

**Steps**
1. Run backend build, unit tests, runtime tests, and audit.
2. Run Android detekt, ktlint, unit tests, debug assemble, and release bundle dry-run.
3. Run `git diff --check` and secret scan.
4. Commit, push, open PR, and monitor CI.
5. Merge only with green checks.
6. Run guarded backend production deploy.
7. Smoke test public deletion page and unauthenticated delete boundary.
