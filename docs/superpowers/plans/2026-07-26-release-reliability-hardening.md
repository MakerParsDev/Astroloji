# Release Reliability Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align analytics contracts, bound offline retries, restore weekly reward visibility, and allow user registration without a synthetic FCM token.

**Architecture:** Keep endpoint paths and database schema stable. Add cross-language contract tests, pure response-classification helpers, transactional DAO pruning, explicit weekly lock detection, and optional FCM registration. Implement each behavior test-first and commit each independently.

**Tech Stack:** Kotlin 2.4.10, Android Room/WorkManager, JUnit/MockK/Truth/Robolectric, TypeScript 5.9.2, Hono, Zod, Vitest.

## Global Constraints

- Add no new dependency.
- Preserve existing endpoint paths and legacy analytics event acceptance.
- Queue capacity is 500 events.
- Queue retention is 30 days.
- Sync batch size is 50 events.
- Retry HTTP 408, 429, and 5xx; permanently drop other 4xx responses.
- Never generate or persist a synthetic FCM token.
- Do not implement client-only rewarded entitlement as part of this tranche.

---

### Task 1: Analytics event contract

**Files:**
- Create: `backend/tests/contracts/analyticsEvents.test.ts`
- Modify: `backend/src/types.ts`

**Interfaces:**
- Consumes: Kotlin constants declared in `AnalyticsEvents`.
- Produces: `USER_EVENT_TYPES` containing all mobile events plus legacy aliases.

- [ ] **Step 1: Write the failing cross-language contract test**

Read `Astroloji/.../AnalyticsRepository.kt`, extract `const val ... = "event"`, and assert every extracted value is included in `USER_EVENT_TYPES`.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/contracts/analyticsEvents.test.ts`

Expected: failure listing the mobile events absent from the backend allowlist.

- [ ] **Step 3: Add canonical mobile event names to `USER_EVENT_TYPES`**

Keep `compat_check`, `content_view`, `notification_tap`, and `share` for deployed-client compatibility.

- [ ] **Step 4: Run targeted and full backend tests**

Run: `npm test -- tests/contracts/analyticsEvents.test.ts tests/utils/validators.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/types.ts backend/tests/contracts/analyticsEvents.test.ts
git commit -m "fix(analytics): align mobile and backend events"
```

### Task 2: Bounded Android analytics queue

**Files:**
- Create: `Astroloji/app/src/test/java/com/parsfilo/astrology/core/data/repository/AnalyticsRepositoryTest.kt`
- Create: `Astroloji/app/src/test/java/com/parsfilo/astrology/notification/EventSyncPolicyTest.kt`
- Create: `Astroloji/app/src/main/java/com/parsfilo/astrology/notification/EventSyncPolicy.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/local/AstrologyDatabase.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/repository/AnalyticsRepository.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/notification/EventSyncWorker.kt`

**Interfaces:**
- Produces: `classifyAnalyticsResponse(code: Int): AnalyticsDeliveryDisposition`.
- Produces: `QueuedEventDao.enqueueBounded(event, maxSize, minCreatedAt)` and `getBatch(limit)`.

- [ ] **Step 1: Write failing response-classification tests**

Assert success deletes, 400/401/422 permanently drop, and 408/429/500 retry.

- [ ] **Step 2: Verify RED**

Run the new `EventSyncPolicyTest` and confirm the helper is missing.

- [ ] **Step 3: Implement the minimal policy helper**

Use a three-value enum: `DELIVERED`, `PERMANENT_FAILURE`, `RETRY`.

- [ ] **Step 4: Write failing repository tests**

Verify HTTP 400 is not queued; HTTP 500 and thrown `IOException` call `enqueueBounded` with max size 500 and a cutoff approximately 30 days before insertion.

- [ ] **Step 5: Verify RED**

Run `AnalyticsRepositoryTest`; expect failure because current code queues every failure and uses `upsert` directly.

- [ ] **Step 6: Add transactional DAO operations and repository classification**

Add `getBatch(50)`, `deleteOlderThan`, `deleteOldestExcess`, and a `@Transaction enqueueBounded` method. Queue only retryable failures.

- [ ] **Step 7: Update worker behavior**

Read 50 records, delete malformed payloads, delete delivered/permanent records, and return `Result.retry()` on the first transient failure or exception.

- [ ] **Step 8: Run targeted Android tests**

Run the repository and policy tests. Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/local/AstrologyDatabase.kt \
  Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/repository/AnalyticsRepository.kt \
  Astroloji/app/src/main/java/com/parsfilo/astrology/notification/EventSyncPolicy.kt \
  Astroloji/app/src/main/java/com/parsfilo/astrology/notification/EventSyncWorker.kt \
  Astroloji/app/src/test/java/com/parsfilo/astrology/core/data/repository/AnalyticsRepositoryTest.kt \
  Astroloji/app/src/test/java/com/parsfilo/astrology/notification/EventSyncPolicyTest.kt
git commit -m "fix(analytics): bound and classify offline events"
```

### Task 3: Weekly reward visibility

**Files:**
- Create: `Astroloji/app/src/test/java/com/parsfilo/astrology/feature/weekly/WeeklyViewModelTest.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/weekly/WeeklyViewModel.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/weekly/WeeklyScreen.kt`

**Interfaces:**
- Produces: `isWeeklyPremiumContentLocked(weekly: WeeklyHoroscope): Boolean`.

- [ ] **Step 1: Write a failing ViewModel test**

Return a weekly model with nonnull `summary` and null premium fields. With rewarded ads enabled, assert `canUnlockWithReward` is true.

- [ ] **Step 2: Verify RED**

Run `WeeklyViewModelTest`; expected false from the existing `summary == null` condition.

- [ ] **Step 3: Implement premium-field lock detection**

A weekly item is locked when any of `love`, `career`, `money`, `bestDay`, or `warning` is null.

- [ ] **Step 4: Attach reward action to the first locked premium section**

Keep overview free. Pass the reward action to the Love section when premium weekly content is locked.

- [ ] **Step 5: Run targeted tests and commit**

```bash
git add Astroloji/app/src/main/java/com/parsfilo/astrology/feature/weekly/WeeklyViewModel.kt \
  Astroloji/app/src/main/java/com/parsfilo/astrology/feature/weekly/WeeklyScreen.kt \
  Astroloji/app/src/test/java/com/parsfilo/astrology/feature/weekly/WeeklyViewModelTest.kt
git commit -m "fix(weekly): expose rewarded premium unlock"
```

### Task 4: Optional real FCM token

**Files:**
- Modify: `backend/tests/utils/validators.test.ts`
- Modify: `backend/tests/workers/app.test.ts`
- Modify: `backend/src/types.ts`
- Modify: `backend/src/utils/validators.ts`
- Modify: `backend/src/workers/user.ts`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/remote/AstrologyApi.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/repository/SessionRepository.kt`
- Modify: `Astroloji/app/src/test/java/com/parsfilo/astrology/core/data/repository/SessionRepositoryRefreshTest.kt`

**Interfaces:**
- `RegisterRequest.fcm_token?: string`.
- `RegisterUserRequest.fcmToken: String? = null` with `explicitNulls = false`.

- [ ] **Step 1: Write failing backend validation and route tests**

Verify registration payload validation succeeds without `fcm_token`, and the register route completes without inserting into `fcm_tokens`.

- [ ] **Step 2: Verify RED**

Run targeted backend tests; expected validation failure.

- [ ] **Step 3: Make backend token optional**

Only call `upsertFcmToken` when a nonblank token is present.

- [ ] **Step 4: Write failing Android session test**

Make `FirebaseMessaging.token` fail and verify `api.registerUser` receives `fcmToken = null`, never a value beginning with `fcm-`.

- [ ] **Step 5: Verify RED**

Run `SessionRepositoryRefreshTest`; expected synthetic fallback token.

- [ ] **Step 6: Remove synthetic token generation**

Use `getOrNull()?.takeIf(String::isNotBlank)` and keep registration independent of token availability.

- [ ] **Step 7: Run targeted tests and commit**

```bash
git add backend/src/types.ts backend/src/utils/validators.ts backend/src/workers/user.ts \
  backend/tests/utils/validators.test.ts backend/tests/workers/app.test.ts \
  Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/remote/AstrologyApi.kt \
  Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/repository/SessionRepository.kt \
  Astroloji/app/src/test/java/com/parsfilo/astrology/core/data/repository/SessionRepositoryRefreshTest.kt
git commit -m "fix(notifications): register without placeholder token"
```

### Task 5: Final verification

**Files:**
- Modify: `docs/superpowers/plans/2026-07-26-release-reliability-hardening.md` to mark completed tasks.

- [ ] **Step 1: Backend verification**

Run `npm run build && npm test && npm run test:runtime`.

- [ ] **Step 2: Android verification**

Run targeted unit tests, `:app:detekt`, and `:app:ktlintCheck` with the configured Android SDK and sufficient Gradle heap.

- [ ] **Step 3: Review diff and secrets**

Run `git diff --check`, `node scripts/scan-secrets.mjs`, and inspect `git status`.

- [ ] **Step 4: Commit documentation completion**

```bash
git add docs/superpowers/plans/2026-07-26-release-reliability-hardening.md
git commit -m "docs: record reliability hardening verification"
```
