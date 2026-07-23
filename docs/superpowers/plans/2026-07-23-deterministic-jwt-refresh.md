# Deterministic JWT Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure expired or rejected application JWTs are never retried unchanged, concurrent HTTP 401 responses share one refresh, every request is retried at most once, and unrecoverable sessions are cleared.

**Architecture:** `SessionTokenStore` provides synchronous JWT validity checks to the network interceptor. `SessionRefreshCoordinator` serializes refresh operations and reuses either a newer token or a shared failure for concurrent requests. `AuthenticatedRequestExecutor` owns the one-refresh/one-retry policy for Retrofit responses, while `SessionRepository` remains the only component that mints, persists, publishes, and invalidates application JWTs. The backend adds a unique JWT ID so a valid refresh cannot reproduce the rejected token.

**Tech Stack:** Kotlin, Coroutines, Retrofit/OkHttp, Hilt, DataStore, Room, JUnit, MockK, Truth, TypeScript, jose, Vitest.

## Global Constraints

- Do not add dependencies or expose credentials.
- Retry an authenticated request at most once.
- Do not run application-JWT recovery for the Firebase-authenticated registration request.
- Preserve onboarding and non-session preferences when invalidating a session.
- Follow red-green-refactor and require fresh verification before merge.

---

### Task 1: Synchronous token validity

**Files:**
- Create: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/session/SessionTokenStore.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/remote/AuthInterceptor.kt`
- Test: `Astroloji/app/src/test/java/com/parsfilo/astrology/core/data/session/SessionTokenStoreTest.kt`

- [x] Write tests for valid, expired, malformed, and blank JWTs.
- [x] Verify tests fail for the missing synchronous validity API.
- [x] Add atomic token storage and JWT expiry parsing.
- [x] Make the interceptor omit expired or malformed tokens.
- [x] Verify focused tests pass.

### Task 2: Serialized refresh coordination

**Files:**
- Create: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/session/SessionRefreshCoordinator.kt`
- Test: `Astroloji/app/src/test/java/com/parsfilo/astrology/core/data/session/SessionRefreshCoordinatorTest.kt`

- [x] Write tests for forced refresh, newer-token reuse, concurrent success, concurrent failure, and unchanged-token rejection.
- [x] Verify tests fail for missing behavior.
- [x] Implement mutex-backed refresh coordination.
- [x] Cache a shared failure for concurrent requests carrying the same rejected token.
- [x] Verify focused tests pass.

### Task 3: One-refresh/one-retry execution

**Files:**
- Create: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/session/AuthenticatedRequestExecutor.kt`
- Test: `Astroloji/app/src/test/java/com/parsfilo/astrology/core/data/session/AuthenticatedRequestExecutorTest.kt`

- [x] Write tests for non-401 responses, successful recovery, refresh failure, final 401 invalidation, and loop prevention.
- [x] Verify tests fail before the executor behavior exists.
- [x] Implement exactly one refresh and one retry.
- [x] Invalidate the recovered session when the retry is also unauthorized.
- [x] Verify focused tests pass.

### Task 4: Repository integration and stable failure

**Files:**
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/repository/SessionRepository.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/repository/ContentRepository.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/preferences/UserPreferencesRepository.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/local/AstrologyDatabase.kt`
- Test: `Astroloji/app/src/test/java/com/parsfilo/astrology/core/data/repository/SessionRepositoryRefreshTest.kt`

- [x] Write failing tests for successful token publication and failed-refresh cleanup.
- [x] Publish successful tokens synchronously after persistence.
- [x] Clear JWT/user entitlement state, cached profile, and Firebase session after unrecoverable recovery.
- [x] Route content, reward, profile, account, subscription, and token-refresh requests through the executor.
- [x] Normalize final 401 responses to `UnauthorizedException`.
- [x] Verify repository and session tests pass.

### Task 5: Distinct backend refresh tokens

**Files:**
- Modify: `backend/src/utils/jwt.ts`
- Test: `backend/tests/utils/jwt.test.ts`

- [x] Write a failing test proving identical claims signed in the same second produce distinct tokens.
- [x] Add a cryptographically random JWT ID (`jti`) to every application token.
- [x] Verify the focused JWT tests pass.
- [x] Verify all backend tests and the TypeScript build pass.

### Task 6: Delivery

- [ ] Run all Android unit tests, ktlint, detekt, debug APK, and instrumented-test APK builds.
- [ ] Run the signed internal-release preflight on the branch.
- [ ] Run backend tests/build and repository secret scanning.
- [ ] Commit and push as `MakerParsDev`.
- [ ] Open a PR referencing #4 and include the sanitized request-flow trace.
- [ ] Merge only after all GitHub checks pass.
- [ ] Verify `main` CI before closing #4.
