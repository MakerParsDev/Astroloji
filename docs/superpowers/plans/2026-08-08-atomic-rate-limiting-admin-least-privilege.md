# Atomic Rate Limiting and Admin Least-Privilege Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace race-prone KV rate counters with strict Durable Object enforcement and split the broad admin credential into independently rotatable least-privilege capabilities, with sanitized audit evidence and safe production migration.

**Architecture:** Provision a SQLite-backed `RateLimitBucket` Durable Object first as an inert rollback floor, then add the strict limiter implementation and four scoped admin capabilities while production traffic remains on the legacy KV limiter. In the final phase, route all protected traffic through the Durable Object, remove the legacy admin fallback, prove exact concurrent enforcement and the privilege matrix, and retire `ADMIN_SECRET`.

**Tech Stack:** Cloudflare Workers + Wrangler `4.118.0`, SQLite-backed Durable Objects, Hono `4.13.0`, TypeScript `5.9.2`, Vitest `3.2.7`, GitHub Actions, Cloudflare Worker secrets, GitHub protected environments.

## Global Constraints

- Preserve existing reviewed rate-limit policy values; do not retune thresholds in #7.
- Keep registration keyed by client IP; keep authenticated protected routes keyed by verified application user ID and server-selected route class.
- `429 RATE_LIMITED` means a valid limiter decision denied quota; limiter unavailability fails closed as `503 RATE_LIMIT_UNAVAILABLE`.
- Never expose principal IDs, IPs, Durable Object IDs, bucket keys, internal counters, credential values/fingerprints, request bodies, purchase tokens, notification/review text, or raw provider responses in logs/evidence.
- Keep `X-Admin-Secret` as the only admin credential header; capability selection is server-side only.
- Capabilities are `content-ops`, `notification-ops`, `play-read`, and `play-write`; `play-write` does not imply `play-read`.
- `GET /api/v1/admin/subscriptions/audit` is `play-write` because the handler can mutate subscription/user premium state.
- Keep scoped admin credentials outside the broad shared Doppler config and generic backend deploy secret allowlist.
- `ENABLE_PRODUCTION_RELEASE=false` throughout #7; no Android rollout, Play product/pricing mutation, customer entitlement mutation, RTDN reconfiguration, or rewarded-entitlement change.
- Phase 0 establishes the Durable Object lifecycle rollback floor; later rollback must never target a pre-Phase-0 Worker version.
- This approved execution runs local/operator commands on the authorized MSI Ubuntu host and CI commands on GitHub Ubuntu; Bash snippets are for those Ubuntu hosts. If a future executor runs locally on Windows, stop and translate local commands to PowerShell first as required by `AGENTS.md` rather than running the Bash snippets unchanged.
- Before implementation changes, read `AGENTS.md`, `README.md`, `backend/README.md`, `RELEASE_RUNBOOK.md`, the approved design, and this plan. After every behavior patch run the relevant focused tests; after the final patch of each reviewed phase run the complete build/test chain specified by that phase.

---
## File Structure

- Create `backend/src/durable/RateLimitBucket.ts`: SQLite-backed Durable Object class and atomic fixed-window decision method.
- Create `backend/src/services/rateLimit.ts`: route policy constants, server-derived bucket naming, KV compatibility helper, Durable Object adapter, and typed decision/error boundary.
- Create `backend/src/services/adminAudit.ts`: allowlisted capability/operation/outcome types and sanitized structured logging.
- Modify `backend/src/middleware/auth.ts`: capability middleware, legacy Phase A fallback, and strict content-cache bypass authorization.
- Modify `backend/src/types.ts`, `backend/src/index.ts`, and `backend/src/transition/index.ts`: scoped secret/binding types and removal of the broad unused `isAdmin` context bit; authorization stays route/capability-owned.
- Modify `backend/src/index.ts`, `backend/src/workers/user.ts`, `backend/src/workers/reward.ts`, `backend/src/workers/subscription.ts`: first preserve KV policy through the compatibility helper, then switch the same call sites to strict Durable Object decisions in Phase B.
- Modify `backend/src/workers/content.ts`, `backend/src/workers/notification.ts`, `backend/src/workers/subscription.ts`: apply route-specific capability middleware and sanitized completion/failure audit behavior.
- Modify `backend/wrangler.toml`: add `RATE_LIMITER` binding and `[exports.RateLimitBucket]` with SQLite storage; keep the export permanently after #7.
- Create `backend/tests/durable/rateLimitBucket.test.ts` and `backend/tests/services/rateLimit.test.ts`: exact concurrency/window/isolation/failure contracts.
- Modify worker/runtime tests and `backend/tests/helpers/env.ts`: scoped credential matrix and final limiter behavior.
- Create `.github/workflows/backend-admin-capability-sync.yml`: guarded capability-specific rotation/sync with one selected protected environment per run.
- Modify `.github/workflows/content-backfill.yml`: consume only `ADMIN_CONTENT_SECRET`, never broad Doppler fallback.
- Modify `.github/workflows/backend-production-deploy.yml`, `backend/scripts/shared.ts`, and secret-sync tests in Phase B: stop requiring/resyncing legacy `ADMIN_SECRET` without touching the four scoped Worker secrets.
- Modify `backend/wrangler.transition.toml`: bind the transition Worker externally to the main Worker's `RateLimitBucket` namespace in Phase B; never provision a second limiter namespace.
- Create `backend/scripts/verify-rate-limit-production.ts`, `.github/workflows/backend-rate-limit-smoke.yml`, and focused tests/contracts for isolated exact production concurrency verification using a temporary synthetic D1 user and the authenticated chart boundary; never use a customer or source-IP bucket for production load proof.
- Create root workflow-contract tests for admin capability isolation and production rate-limit verification behavior.
- Create `docs/verification/atomic-rate-limiting-admin-least-privilege-2026-08-08.md` only after all production verification succeeds.

---
## Execution Bootstrap — Land the approved design and plan before code

- [ ] Commit this implementation plan on the existing design branch with author `MakerParsDev <makerpars@gmail.com>`; the branch diff at this point must contain only the approved design spec and this plan.
- [ ] Push the same-repo docs branch and open a PR against `main`; require exact-head CI/security/CodeRabbit review and resolve every actionable thread.
- [ ] Merge only the exact reviewed docs head with head-match protection and verify the merge parents independently.
- [ ] Fetch the new `origin/main`; verify both `docs/superpowers/specs/2026-08-08-atomic-rate-limiting-admin-least-privilege-design.md` and this plan are present there.
- [ ] Create the Phase 0 branch/worktree fresh from that merged `origin/main`. Do not implement Phase 0 on the docs worktree.
- [ ] In the fresh Phase 0 worktree, read `AGENTS.md`, `README.md`, `backend/README.md`, `RELEASE_RUNBOOK.md`, the merged design, and this plan before the first code edit. Treat the plan's Ubuntu Bash commands as MSI/GitHub Ubuntu-only.
- [ ] For every implementation patch, run the task's focused tests immediately after the patch. Before each phase PR, run that phase's complete build/test/audit chain; do not defer general validation to CI.

### Task 1: Phase 0 — Declare the Durable Object lifecycle without changing traffic

**Files:**
- Create: `backend/src/durable/RateLimitBucket.ts`
- Modify: `backend/src/index.ts`
- Modify: `backend/wrangler.toml`
- Test: `backend/tests/runtime/worker-runtime.test.ts`

**Interfaces:**
- Produces: exported class `RateLimitBucket extends DurableObject<Env>` and binding `RATE_LIMITER` for later tasks.
- No production route consumes the binding in Phase 0.

- [ ] **Step 1: Add a failing configuration/runtime contract**

Add assertions that `wrangler.toml` declares `RATE_LIMITER -> RateLimitBucket`, `[exports.RateLimitBucket]`, `type = "durable-object"`, and `storage = "sqlite"`; add a runtime startup test that existing public/admin boundaries are unchanged.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cd backend && npm run test:runtime`

Expected: the new configuration/export assertions fail because the binding/class do not exist yet; existing runtime cases remain unchanged.

- [ ] **Step 3: Implement the inert Durable Object export**
Use the current declarative lifecycle form:

```ts
// backend/src/durable/RateLimitBucket.ts
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '@/types';

export class RateLimitBucket extends DurableObject<Env> {}
```

```ts
// backend/src/index.ts
export { RateLimitBucket } from '@/durable/RateLimitBucket';
```

```toml
[[durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimitBucket"

[exports.RateLimitBucket]
type = "durable-object"
storage = "sqlite"
```

Do not add a legacy `[[migrations]]` block and do not route any request to `RATE_LIMITER` yet.

- [ ] **Step 4: Regenerate/check Worker types and verify GREEN**

Run: `cd backend && npm run types:generate && npm run build && npm run test:runtime`

Expected: generated `CloudflareEnv` includes `RATE_LIMITER`; build and existing runtime boundary tests pass with unchanged behavior.

- [ ] **Step 5: Commit Phase 0 code**

```bash
git add backend/src/durable/RateLimitBucket.ts backend/src/index.ts backend/wrangler.toml backend/worker-configuration.d.ts backend/tests/runtime/worker-runtime.test.ts
git commit -m "feat: provision rate limit durable object"
```
### Task 2: Phase 0 — Review, merge, deploy, and establish the rollback floor

**Files:**
- No implementation files beyond Task 1.
- Evidence stays restricted until final #7 verification; do not create the public evidence document yet.

**Interfaces:**
- Consumes: inert `RateLimitBucket` export/binding from Task 1.
- Produces: exact merged Phase 0 `main` SHA and exact active Cloudflare Worker version that later phases may safely roll back to.

- [ ] **Step 1: Run the full pre-PR gate from the Phase 0 tree**

Run root repository contract tests, `node scripts/scan-secrets.mjs`, `git diff --check`, actionlint if installed, then in `backend/`: `npm ci`, `npm run build`, `npm test`, `npm run test:runtime`, `npm run build:transition`, `npm run test:runtime:transition`, and `npm audit --audit-level=high`.

Expected: every suite/build/audit is green and no generated/local secret artifact is tracked.

- [ ] **Step 2: Push same-repo branch and open the Phase 0 PR**

Require author `MakerParsDev`, base `main`, non-cross-repository PR, and exact current head SHA. Wait for Android, backend, secret-scan, Semgrep, GitGuardian, and CodeRabbit on that exact head; inspect every actionable review thread before merge.

- [ ] **Step 3: Merge only the exact reviewed head and verify parents**

Use `gh pr merge --merge --match-head-commit <reviewed-head>` and then verify `origin/main` equals the merge SHA and the second merge parent equals the reviewed head.

- [ ] **Step 4: Run production preconditions from a detached exact-main worktree**

Verify `ENABLE_PRODUCTION_RELEASE=false`, no unintended release workflow is active, current health/admin unauthorized boundaries are green, and the deploy target is the exact Phase 0 merged main SHA.

- [ ] **Step 5: Dispatch `backend-production-deploy.yml` once**

Require the resolved workflow run to have `event=workflow_dispatch`, `headBranch=main`, and exact Phase 0 merged SHA. Require build/unit/runtime/deploy/live-verification success before continuing.

- [ ] **Step 6: Capture the Phase 0 rollback floor**

Read the 100%-active Worker deployment after the successful Phase 0 deploy and write only its version identifier to a local mode-0600 rollback file. Never print the identifier into chat/public evidence. Record only `phase0RollbackFloorCaptured=true` in sanitized notes.

- [ ] **Step 7: Start Phase A from fresh `origin/main`**

Create a new same-repo branch/worktree from the just-merged/deployed Phase 0 `origin/main`; do not continue implementation in the Phase 0 worktree.
### Task 3: Phase A — Implement the strict limiter while keeping customer traffic on KV

**Files:**
- Modify: `backend/src/durable/RateLimitBucket.ts`
- Create: `backend/src/services/rateLimit.ts`
- Modify: `backend/src/services/cache.ts`
- Modify: `backend/src/index.ts`
- Modify: `backend/src/workers/user.ts`
- Modify: `backend/src/workers/reward.ts`
- Modify: `backend/src/workers/subscription.ts`
- Create: `backend/tests/durable/rateLimitBucket.test.ts`
- Create: `backend/tests/services/rateLimit.test.ts`

**Interfaces:**
- Produces: `RateLimitBucket.check(input: { limit: number; windowSeconds: number }): Promise<RateLimitDecision>`.
- Produces: `enforceKvRateLimit(env, key, limit, windowSeconds): Promise<boolean>` for Phase A compatibility.
- Produces: `enforceStrictRateLimit(env, routeClass, principal, limit, windowSeconds): Promise<{ status: 'ok'; decision: RateLimitDecision } | { status: 'unavailable' }>` for Phase B.
- Produces: deterministic hashed object naming; raw principals never become Durable Object names.

- [ ] **Step 1: Write RED tests for atomic decisions and adapter isolation**

Use a serializing fake `DurableObjectStorage.transaction()` harness and freeze `Date.now()`. The core concurrency assertion must be shaped like:

```ts
const results = await Promise.all(
  Array.from({ length: attempts }, () =>
    claimRateLimitWindow(storage, nowMs, { limit, windowSeconds })
  )
);
expect(results.filter((result) => result.allowed)).toHaveLength(limit);
expect(results.filter((result) => !result.allowed)).toHaveLength(attempts - limit);
```

Also assert limit-1/two-call exactness, fixed-window reset, different route/principal object names, no raw principal substring in the object name, and adapter `status: 'unavailable'` when namespace/stub calls reject. Add invalid-config cases proving zero, negative, or non-integer `limit`/`windowSeconds` are rejected before any storage write.
- [ ] **Step 2: Run focused tests and verify RED**

Run: `cd backend && npx vitest run tests/durable/rateLimitBucket.test.ts tests/services/rateLimit.test.ts`

Expected: FAIL because the strict limiter contracts do not exist.

- [ ] **Step 3: Implement the storage-backed fixed-window transaction**

Use one storage record for the active window and validate positive integer config before changing state:

```ts
export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function assertRateLimitConfig(limit: number, windowSeconds: number): void {
  if (
    !Number.isSafeInteger(limit) ||
    limit <= 0 ||
    !Number.isSafeInteger(windowSeconds) ||
    windowSeconds <= 0
  ) {
    throw new RangeError('Rate-limit policy values must be positive safe integers.');
  }
}

export async function claimRateLimitWindow(
  storage: Pick<DurableObjectStorage, 'transaction'>,
  nowMs: number,
  input: { limit: number; windowSeconds: number }
): Promise<RateLimitDecision> {
  assertRateLimitConfig(input.limit, input.windowSeconds);
  const windowMs = input.windowSeconds * 1000;
  const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
  return storage.transaction(async (txn) => {
    const current = await txn.get<{ windowStartMs: number; count: number }>('counter');
    const count = current?.windowStartMs === windowStartMs ? current.count : 0;
    if (count >= input.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((windowStartMs + windowMs - nowMs) / 1000))
      };
    }
    await txn.put('counter', { windowStartMs, count: count + 1 });
    return {
      allowed: true,
      remaining: Math.max(0, input.limit - count - 1),
      retryAfterSeconds: 0
    };
  });
}
```

`RateLimitBucket.check()` delegates to this function using `this.ctx.storage` and `Date.now()`.
- [ ] **Step 4: Add the strict adapter and preserve KV behavior explicitly**

Move the old KV counter out of `services/cache.ts` and rename it `enforceKvRateLimit` so Phase A call sites are visibly compatibility-only. Build the Durable Object name from a SHA-256 digest of server-derived route class + principal:

```ts
export async function enforceStrictRateLimit(
  env: { RATE_LIMITER: DurableObjectNamespace<RateLimitBucket> },
  routeClass: string,
  principal: string,
  limit: number,
  windowSeconds: number
): Promise<{ status: 'ok'; decision: RateLimitDecision } | { status: 'unavailable' }> {
  assertRateLimitConfig(limit, windowSeconds);
  const name = await buildRateLimitObjectName(routeClass, principal);

  try {
    const stub = env.RATE_LIMITER.getByName(name);
    return { status: 'ok', decision: await stub.check({ limit, windowSeconds }) };
  } catch {
    return { status: 'unavailable' };
  }
}
```

Configuration validation and deterministic object-name construction are deliberately outside the availability `try/catch`; invalid policy/programming errors must propagate to tests rather than being mislabeled as `RATE_LIMIT_UNAVAILABLE`. Only namespace/stub RPC or remote storage failure is converted to the fail-closed availability result. Keep `index.ts`, `user.ts`, `reward.ts`, and `subscription.ts` calling `enforceKvRateLimit` during Phase A. Do not route production traffic to the Durable Object yet.

- [ ] **Step 5: Verify Phase A limiter implementation GREEN**

Run: `cd backend && npx vitest run tests/durable/rateLimitBucket.test.ts tests/services/rateLimit.test.ts && npm run build && npm test && npm run test:runtime`

Expected: strict concurrency/isolation tests pass, while existing route behavior remains unchanged.

- [ ] **Step 6: Commit the inert strict limiter implementation**

```bash
git add backend/src/durable/RateLimitBucket.ts backend/src/services/rateLimit.ts backend/src/services/cache.ts backend/src/index.ts backend/src/workers/user.ts backend/src/workers/reward.ts backend/src/workers/subscription.ts backend/tests/durable/rateLimitBucket.test.ts backend/tests/services/rateLimit.test.ts
git commit -m "feat: add strict durable object rate limiter"
```
### Task 4: Phase A — Add scoped admin capability authorization and sanitized audit events

**Files:**
- Create: `backend/src/services/adminAudit.ts`
- Modify: `backend/src/middleware/auth.ts`
- Modify: `backend/src/types.ts`
- Modify: `backend/src/index.ts`
- Modify: `backend/src/transition/index.ts`
- Modify: `backend/tests/helpers/env.ts`
- Create: `backend/tests/middleware/adminCapabilities.test.ts`

**Interfaces:**
- Produces: `AdminCapability = 'content-ops' | 'notification-ops' | 'play-read' | 'play-write'`.
- Produces: fixed `AdminOperation` values from the approved spec.
- Produces: `requireAdminCapability(capability, operation): AppMiddleware` with Phase A scoped-first, legacy-second matching.
- Produces: `logAdminOperation({ requestId, capability, operation, outcome, dryRun? })` with no request-derived sensitive fields.

- [ ] **Step 1: Write RED capability/audit tests**

Cover: correct scoped credential authorizes; each of the other three scoped credentials rejects; legacy `ADMIN_SECRET` authorizes only during Phase A; missing/invalid credential rejects; logs contain exactly allowlisted keys and never the supplied secret. Capture `console.log` and assert the serialized object has no credential string.

```ts
expect(logEntry).toMatchObject({
  event: 'admin_operation',
  requestId: expect.any(String),
  capability: 'content-ops',
  operation: 'content.backfill',
  outcome: 'authorized'
});
expect(JSON.stringify(logEntry)).not.toContain('content-secret');
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cd backend && npx vitest run tests/middleware/adminCapabilities.test.ts`

Expected: FAIL because scoped bindings/middleware/audit helper do not exist.

- [ ] **Step 3: Add Phase A secret bindings and audit enums**

Extend `SecretBindings` with `ADMIN_CONTENT_SECRET`, `ADMIN_NOTIFICATION_SECRET`, `ADMIN_PLAY_READ_SECRET`, and `ADMIN_PLAY_WRITE_SECRET` while retaining `ADMIN_SECRET` for Phase A only. Add matching fake values in `createTestEnv()`. Remove `isAdmin` from `AppVariables` and remove the `c.set('isAdmin', false)` initialization from both main and transition entrypoints; scoped middleware must not flatten authorization into a generic admin boolean.
- [ ] **Step 4: Implement scoped-first authorization with legacy compatibility**

Use a server-owned binding map; never accept capability from request data:

```ts
const ADMIN_SECRET_BINDINGS = {
  'content-ops': 'ADMIN_CONTENT_SECRET',
  'notification-ops': 'ADMIN_NOTIFICATION_SECRET',
  'play-read': 'ADMIN_PLAY_READ_SECRET',
  'play-write': 'ADMIN_PLAY_WRITE_SECRET'
} as const;

function matchesAdminCapability(c: AppContext, capability: AdminCapability): boolean {
  const provided = c.req.header('x-admin-secret');
  const scoped = c.env[ADMIN_SECRET_BINDINGS[capability]];
  return matchesSecret(scoped, provided) || matchesSecret(c.env.ADMIN_SECRET, provided);
}
```

`requireAdminCapability()` logs `rejected` before `403`, logs `authorized` before `next()`, logs `completed` only for `<400` responses, and logs `failed` when the downstream handler throws or returns any `>=400` response. It never sets a generic `isAdmin` flag.

- [ ] **Step 5: Make cache bypass a real privileged operation**

When `x-cache-bypass` is false/absent, continue normally without admin auth. When it is true, require `content-ops`; invalid/missing admin authorization returns `403` rather than silently serving the normal cached path. Successful bypass sets `bypassCache=true` and emits only sanitized `content.cache_bypass` audit fields.

- [ ] **Step 6: Verify middleware/audit GREEN**

Run: `cd backend && npx vitest run tests/middleware/adminCapabilities.test.ts tests/utils/security.test.ts && npm run build`

Expected: capability isolation, legacy Phase A compatibility, cache-bypass fail-closed behavior, and audit redaction pass.

- [ ] **Step 7: Commit capability primitives**

```bash
git add backend/src/services/adminAudit.ts backend/src/middleware/auth.ts backend/src/types.ts backend/src/index.ts backend/src/transition/index.ts backend/tests/helpers/env.ts backend/tests/middleware/adminCapabilities.test.ts
git commit -m "feat: add scoped admin capability authorization"
```
### Task 5: Phase A — Apply the exact privilege matrix to every admin route

**Files:**
- Modify: `backend/src/index.ts`
- Modify: `backend/src/middleware/auth.ts`
- Modify: `backend/src/workers/content.ts`
- Modify: `backend/src/workers/notification.ts`
- Modify: `backend/src/workers/subscription.ts`
- Create: `backend/tests/workers/adminCapabilities.test.ts`
- Modify: `backend/tests/runtime/worker-runtime.test.ts`
- Modify: existing content/subscription/monetization tests that send `ADMIN_SECRET`.

**Interfaces:**
- Consumes: `requireAdminCapability(capability, operation)` from Task 4.
- Produces: route-owned authorization; there is no global all-powerful admin middleware after this task.

- [ ] **Step 1: Write RED route-wiring tests**

Use representative safe requests and assert the capability required by each route:

```text
content-ops       -> POST /admin/content/backfill
notification-ops  -> POST /notifications/send
play-read         -> GET  /admin/play/subscriptions
play-read         -> GET  /admin/play/reviews
play-write        -> PATCH /admin/play/subscriptions/:productId
play-write        -> GET   /admin/subscriptions/audit
play-write        -> POST  /admin/play/reviews/:reviewId/reply
```

For mutation routes, use malformed/validation-failing bodies so the correct credential crosses auth and receives `400` without performing a mutation; every wrong scoped credential receives `403` before parsing/provider access.

- [ ] **Step 2: Run route tests and verify RED**

Run: `cd backend && npx vitest run tests/workers/adminCapabilities.test.ts tests/workers/content.test.ts tests/workers/subscription.test.ts tests/workers/monetization.test.ts`

Expected: FAIL because the current global `adminSecretMiddleware` grants every route the same credential.

- [ ] **Step 3: Remove the global admin middleware from `index.ts`**

Delete `apiAdminRoutes.use('*', adminSecretMiddleware)`, remove the old import, and delete the `adminSecretMiddleware` export itself from `middleware/auth.ts`. Legacy Phase A compatibility may exist only inside `matchesAdminCapability()`; there must be no callable all-capabilities middleware. Keep the router itself; each registered route now owns its capability middleware. Add a source assertion that the symbol `adminSecretMiddleware` is absent.
- [ ] **Step 4: Attach capability middleware at each route declaration**

Examples:

```ts
app.post(
  '/admin/content/backfill',
  requireAdminCapability('content-ops', 'content.backfill'),
  async (c) => { /* existing handler body */ }
);

app.post(
  '/notifications/send',
  requireAdminCapability('notification-ops', 'notification.send'),
  async (c) => { /* existing handler body */ }
);
```

Apply the approved mapping exactly. In particular, attach `play-write` to `/admin/subscriptions/audit` despite the GET method.

- [ ] **Step 5: Update runtime boundary tests for scoped credentials + legacy compatibility**

Add scoped vars to the `unstable_dev` runtime env. Prove: notification scoped secret reaches body validation, content scoped secret is rejected on notification, no secret is rejected, and legacy `ADMIN_SECRET` still reaches validation during Phase A.

- [ ] **Step 6: Run worker/runtime regressions and verify GREEN**

Run: `cd backend && npx vitest run tests/workers/adminCapabilities.test.ts tests/workers/content.test.ts tests/workers/subscription.test.ts tests/workers/monetization.test.ts && npm run test:runtime && npm test`

Expected: every route is bound to exactly one capability and all existing non-admin behavior remains green.

- [ ] **Step 7: Commit route privilege wiring**

```bash
git add backend/src/index.ts backend/src/middleware/auth.ts backend/src/workers/content.ts backend/src/workers/notification.ts backend/src/workers/subscription.ts backend/tests/workers/adminCapabilities.test.ts backend/tests/runtime/worker-runtime.test.ts backend/tests/workers/content.test.ts backend/tests/workers/subscription.test.ts backend/tests/workers/monetization.test.ts
git commit -m "feat: enforce admin privilege matrix"
```
### Task 6: Phase A — Add capability-specific rotation workflows and migrate content backfill

**Files:**
- Create: `.github/workflows/backend-admin-capability-sync.yml`
- Modify: `.github/workflows/content-backfill.yml`
- Create: `scripts/backend-admin-capability-workflow.test.mjs`
- Modify: `scripts/content-backfill-approval.test.mjs`
- Keep: `.github/workflows/backend-admin-secret-sync.yml` during Phase A only.

**Interfaces:**
- Produces protected environments: `production-admin-content`, `production-admin-notification`, `production-admin-play-read`, `production-admin-play-write`.
- Each selected workflow job receives exactly one scoped admin credential plus the Cloudflare control-plane credential needed for that rotation.
- No capability workflow receives the other three admin credentials or broad Doppler application secrets.

- [ ] **Step 1: Write RED workflow-contract tests**

Assert all four protected environment names are present and each job references only its matching secret. Assert `content-backfill.yml` uses `production-admin-content` + `ADMIN_CONTENT_SECRET`, and contains no `ADMIN_SECRET`, `DOPPLER_TOKEN`, or Doppler secret fallback.

```js
assert.match(contentBackfill, /environment: production-admin-content/);
assert.match(contentBackfill, /ADMIN_CONTENT_SECRET: \$\{\{ secrets\.ADMIN_CONTENT_SECRET \}\}/);
assert.doesNotMatch(contentBackfill, /ADMIN_SECRET|DOPPLER_TOKEN|doppler secrets get/);
```

- [ ] **Step 2: Run workflow contracts and verify RED**

Run: `node --test scripts/backend-admin-capability-workflow.test.mjs scripts/content-backfill-approval.test.mjs`

Expected: FAIL because current workflows still use the broad legacy credential.

- [ ] **Step 3: Create the guarded capability rotation workflow**

Use one `workflow_dispatch` choice input and four mutually exclusive jobs. Each job must require repository `MakerParsDev/Astroloji`, `refs/heads/main`, an exact confirmation string, its own protected environment, and its own secret binding. Sync with stdin, never argv:

```bash
printf '%s' "$ADMIN_CAPABILITY_SECRET" | npx wrangler secret put "$WORKER_SECRET_NAME"
```
- [ ] **Step 4: Make each capability run prove one complete matrix row**

With only the selected credential in memory, call one representative endpoint for each capability. The selected capability must cross auth; the other three must return backend-owned `403` with JSON `error.code=FORBIDDEN`.

Use these non-destructive authorized expectations:

```text
content-ops      POST /admin/content/backfill                    -> 400 INVALID_REQUEST with malformed JSON
notification-ops POST /notifications/send                        -> 400 INVALID_REQUEST with malformed JSON
play-read        GET  /admin/play/subscriptions                   -> 200, response body discarded and never retained
play-write       PATCH /admin/play/subscriptions/verification-id  -> 400 INVALID_REQUEST with empty regions
```

For the read-only Play call, use status-only handling such as `curl --output /dev/null --write-out '%{http_code}'`; never write or retain the upstream body in `$RUNNER_TEMP`, and never include it in failure diagnostics. Other malformed-request response files, if any, remain restricted and are removed in an `if: always()` cleanup step.

- [ ] **Step 5: Migrate content backfill to its scoped environment**

Replace broad admin/Doppler fallback with `ADMIN_CONTENT_SECRET`. Keep existing approval metadata, scheduling guard, and payload behavior. The request header remains `x-admin-secret`.

- [ ] **Step 6: Verify workflow contracts GREEN**

Run: `node --test scripts/backend-admin-capability-workflow.test.mjs scripts/content-backfill-approval.test.mjs scripts/backend-production-deploy-workflow.test.mjs`

Expected: scoped workflow isolation passes while the Phase A generic production deploy still intentionally requires legacy `ADMIN_SECRET` for rollback compatibility.

- [ ] **Step 7: Run secret/action syntax checks and commit**

Run: `node scripts/scan-secrets.mjs && git diff --check` and `actionlint` when installed.

```bash
git add .github/workflows/backend-admin-capability-sync.yml .github/workflows/content-backfill.yml scripts/backend-admin-capability-workflow.test.mjs scripts/content-backfill-approval.test.mjs
git commit -m "ci: scope admin capability rotation"
```
### Task 7: Phase A — Review, pre-provision, deploy, prove the matrix, and prove rotation

**Files:**
- No new implementation files beyond Tasks 3–6.
- Local restricted state: mode-0600 scoped credential file and rollback-version files; never commit them.

**Interfaces:**
- Consumes: Phase 0 rollback floor, strict limiter implementation (still inert), scoped admin middleware, scoped rotation workflow.
- Produces: verified Phase A Worker version, four scoped credentials active in production, 4x4 matrix evidence, one rotation proof, sanitized audit proof.

- [ ] **Step 1: Run the complete Phase A pre-PR gate**

Run root contract tests + secret scan + `git diff --check` + actionlint, then backend fresh install/build/unit/runtime/transition/audit gates. Re-run focused limiter concurrency and admin capability tests in the same tree.

- [ ] **Step 2: Open the Phase A same-repo PR and wait for exact-head review**

Require fresh Android/backend/secret-scan/Semgrep/GitGuardian/CodeRabbit success. Inspect every actionable review thread; any push invalidates prior check evidence.

- [ ] **Step 3: Pre-provision four scoped credentials before the Phase A merge/deploy window**

Generate four independent high-entropy values into one local mode-0600 file; do not echo them. Create/update protected environments `production-admin-content`, `production-admin-notification`, `production-admin-play-read`, and `production-admin-play-write`; set only each environment's matching admin secret plus the Cloudflare control-plane settings required by the rotation workflow.

Set the four corresponding Cloudflare Worker secrets by stdin while the Phase 0 Worker is still active. Verify only name presence in GitHub/Cloudflare inventories.

- [ ] **Step 4: Prevent a scheduled content-backfill race during code cutover**

Read the prior `production` `ENABLE_CONTENT_BACKFILL` state without exposing unrelated settings. Set the new `production-admin-content` `ENABLE_CONTENT_BACKFILL=false` before merge so the newly merged workflow cannot run against the old Phase 0 auth boundary. Preserve the previous enabled/disabled value locally for restoration after Phase A verification.

- [ ] **Step 5: Merge exact reviewed Phase A head and deploy exact merged `main` once**

Verify merge parents and `origin/main`, create a detached exact-main production worktree, confirm release gate false, then dispatch `backend-production-deploy.yml` exactly once. Require all build/test/schema/deploy/live-verification steps to succeed.
- [ ] **Step 6: Prove all four privilege-matrix rows in production**

Dispatch `backend-admin-capability-sync.yml` four times on exact Phase A `main`, once per capability. For each run require: own representative endpoint reaches its non-destructive expected status; the same credential receives backend-owned `403/FORBIDDEN` on the other three representative endpoints; no response body or secret is printed.

Record only sanitized booleans such as `contentRowReady=true`, `notificationRowReady=true`, `playReadRowReady=true`, and `playWriteRowReady=true`.

- [ ] **Step 7: Prove one capability rotation without source changes**

Rotate only `ADMIN_CONTENT_SECRET`: generate a replacement locally, update only `production-admin-content`, run the content capability sync workflow, and require its row to pass. Then re-run one unrelated capability row (prefer `notification-ops`) and require it to remain valid. Delete the superseded local content credential value from the restricted file.

- [ ] **Step 8: Capture sanitized `admin_operation` telemetry**

Start a short Cloudflare tail capture into a local mode-0600 file. Trigger one authorized malformed `content-ops` request and one rejected cross-capability request. Parse locally and require at least one `authorized` and one `rejected` event with only `event`, `requestId`, `capability`, `operation`, `outcome`, and optional `dryRun` keys. Assert none of the four credential values or request bodies occur in the captured file, then delete the file.

- [ ] **Step 9: Restore the content-backfill schedule state**

Set `production-admin-content` `ENABLE_CONTENT_BACKFILL` to the exact previously captured enabled/disabled state. Verify only the resulting boolean; do not trigger a real backfill as part of #7 verification.

- [ ] **Step 10: Capture the Phase A rollback version**

Read the 100%-active Worker version after all Phase A checks and save its identifier locally with mode 0600. This exact version is the only Phase B rollback target. Do not delete the Phase 0 rollback-floor metadata yet.

- [ ] **Step 11: Start Phase B from fresh `origin/main`**

Fetch the exact Phase A merged main and create a fresh same-repo Phase B branch/worktree. Do not write Phase B changes in the Phase A worktree.
### Task 8: Phase B — Switch every protected rate-limit call site to the shared strict Durable Object

**Files:**
- Modify: `backend/src/services/rateLimit.ts`
- Modify: `backend/src/types.ts`
- Modify: `backend/src/index.ts`
- Modify: `backend/src/workers/user.ts`
- Modify: `backend/src/workers/reward.ts`
- Modify: `backend/src/workers/subscription.ts`
- Modify: `backend/wrangler.transition.toml`
- Modify: `backend/tests/runtime/worker-runtime.test.ts`
- Modify/Create: focused user/reward/subscription rate-limit tests.

**Interfaces:**
- Consumes: `enforceStrictRateLimit()` and `RateLimitBucket` from Phase A.
- Produces: no remaining KV `ratelimit:` counter reads/writes in runtime code.
- Produces: transition binding `RATE_LIMITER -> RateLimitBucket` with `script_name = "astrology-backend"`, so main and transition Workers share the same quota state.

- [ ] **Step 1: Write RED end-to-end strict limiter tests**

In main Worker runtime tests, issue a concurrent burst to `POST /api/v1/users/register` without Authorization. Because registration limiting runs before auth and the local principal is shared, admitted requests must return `401` and excess requests must return `429`; assert the admitted count equals the configured register limit exactly.

For all five protected boundaries — registration, content, chart, reward prepare, and subscription verify — add two fail-closed cases: a stub decision with `allowed=false` must return `429` before the downstream handler/dependency runs, and a rejecting/unavailable `RATE_LIMITER` stub must return `503 RATE_LIMIT_UNAVAILABLE` with the same zero-downstream guarantee. Assert zero Firebase verification/customer DB mutation for registration, zero R2/content handler work for content, zero chart handler execution for chart, zero reward entitlement/challenge work for reward prepare, and zero Play/provider/subscription work for subscription verify.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cd backend && npx vitest run tests/services/rateLimit.test.ts tests/workers/user.test.ts tests/workers/reward.test.ts tests/workers/subscription.test.ts && npm run test:runtime`

Expected: failures show routes still call KV compatibility logic and no `503` strict-failure path exists.

- [ ] **Step 3: Add one shared HTTP failure mapper**

Export a helper that returns `null` for allowed decisions, `429 RATE_LIMITED` + non-sensitive `Retry-After` for quota rejection, and `503 RATE_LIMIT_UNAVAILABLE` for adapter failure. It must not include route class, principal, counter, bucket/object ID, or limit values in the body.
- [ ] **Step 4: Switch the five existing protected buckets to strict decisions**

Replace KV compatibility calls at exactly these boundaries, preserving current policy values and principals:

```text
/users/register          -> routeClass register, client IP
/content/*               -> server content class + authenticated user ID
/chart/*                 -> chart + authenticated user ID
/subscriptions/verify    -> subscription-verify + authenticated user ID
/rewards/prepare         -> reward-prepare + authenticated user ID
```

For each call: obtain strict result, return `503` on unavailable, return `429` on denied, and only then execute the existing handler/business logic.

- [ ] **Step 5: Bind the transition Worker to the same main-Worker namespace**

Add only an external binding to `wrangler.transition.toml`; do not export/provision a second `RateLimitBucket` class there:

```toml
[[durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimitBucket"
script_name = "astrology-backend"
```

Update `RewardEnv`/`TransitionEnv` typing so the shared reward route can call the strict limiter in both Workers.

- [ ] **Step 6: Delete KV rate-limit compatibility code and add a source contract**

Remove `enforceKvRateLimit` entirely after all call sites are strict. Create `scripts/backend-rate-limit-contract.test.mjs` that reads the known runtime files and rejects `enforceKvRateLimit`, `ratelimit:` KV counter keys, or a second transition `RateLimitBucket` export.

- [ ] **Step 7: Verify strict limiter GREEN across main + transition builds**

Run: `node --test scripts/backend-rate-limit-contract.test.mjs`, then `cd backend && npm run types:generate && npm run build && npm test && npm run test:runtime && npm run build:transition && npm run test:runtime:transition`.

Expected: exact concurrent main-runtime enforcement passes; transition build/runtime stays green and uses the external binding only when an authenticated prepare request reaches the limiter.

- [ ] **Step 8: Commit strict enforcement**

```bash
git add backend/src/services/rateLimit.ts backend/src/types.ts backend/src/index.ts backend/src/workers/user.ts backend/src/workers/reward.ts backend/src/workers/subscription.ts backend/wrangler.transition.toml backend/worker-configuration.d.ts backend/tests scripts/backend-rate-limit-contract.test.mjs
git commit -m "feat: enforce strict atomic rate limits"
```
### Task 9: Phase B — Remove legacy admin authorization and broad secret resync

**Files:**
- Modify: `backend/src/middleware/auth.ts`
- Modify: `backend/src/types.ts`
- Modify: `backend/tests/helpers/env.ts`
- Modify: `backend/tests/middleware/adminCapabilities.test.ts`
- Modify: `backend/tests/runtime/worker-runtime.test.ts`
- Modify: `backend/scripts/shared.ts`
- Modify: `backend/tests/scripts/shared.test.ts`
- Modify: `.github/workflows/backend-production-deploy.yml`
- Delete: `.github/workflows/backend-admin-secret-sync.yml`
- Modify: `scripts/backend-production-deploy-workflow.test.mjs`
- Modify: `backend/README.md`, `README.md`, `RELEASE_RUNBOOK.md` where they describe active admin rotation.

**Interfaces:**
- `requireAdminCapability()` accepts only the route's scoped binding after this task.
- Generic `CLOUDFLARE_SECRET_NAMES` contains core application secrets only; it contains neither legacy `ADMIN_SECRET` nor any of the four scoped admin credentials.
- Capability rotation remains exclusively through `backend-admin-capability-sync.yml`.

- [ ] **Step 1: Change tests first so legacy authorization is RED**

Update capability/runtime tests so a historical legacy credential must receive `403` on representative privileged routes. Update shared/deploy workflow tests to require legacy absence and to require scoped admin secrets are not in the generic deploy allowlist.

```ts
expect(CLOUDFLARE_SECRET_NAMES).not.toContain('ADMIN_SECRET');
expect(CLOUDFLARE_SECRET_NAMES).not.toContain('ADMIN_CONTENT_SECRET');
expect(CLOUDFLARE_SECRET_NAMES).not.toContain('ADMIN_NOTIFICATION_SECRET');
expect(CLOUDFLARE_SECRET_NAMES).not.toContain('ADMIN_PLAY_READ_SECRET');
expect(CLOUDFLARE_SECRET_NAMES).not.toContain('ADMIN_PLAY_WRITE_SECRET');
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cd backend && npx vitest run tests/middleware/adminCapabilities.test.ts tests/scripts/shared.test.ts && npm run test:runtime`; from repo root run `node --test scripts/backend-production-deploy-workflow.test.mjs scripts/backend-admin-capability-workflow.test.mjs`.

Expected: failures point to legacy fallback/type/allowlist/workflow references.
- [ ] **Step 3: Remove the legacy runtime fallback and binding**

Delete `ADMIN_SECRET` from `SecretBindings`, `createTestEnv()`, and `matchesAdminCapability()`. The final matcher is scoped-only:

```ts
function matchesAdminCapability(c: AppContext, capability: AdminCapability): boolean {
  const provided = c.req.header('x-admin-secret');
  return matchesSecret(c.env[ADMIN_SECRET_BINDINGS[capability]], provided);
}
```

Keep the same `403 FORBIDDEN` response shape so no credential-generation detail is revealed.

- [ ] **Step 4: Remove legacy admin from generic deploy/sync paths**

Delete `ADMIN_SECRET` from `CLOUDFLARE_SECRET_NAMES`, from the Doppler required list/masking in `backend-production-deploy.yml`, and delete `backend-admin-secret-sync.yml`. Do not add scoped admin credentials to either generic list.

- [ ] **Step 5: Update active operator docs**

Replace the single-secret rotation instructions with the four capability environments/workflow. Document that generic backend deploy does not own scoped admin credentials and that emergency revocation is per capability. Do not publish credential values or production control-plane identifiers.

- [ ] **Step 6: Add an active-reference guard**

Create/extend a root contract that rejects active legacy auth configuration in runtime/workflow/runbook files while allowing historical design/plan/evidence references and explicit negative-test strings. It must specifically reject `secrets.ADMIN_SECRET`, `wrangler secret put ADMIN_SECRET`, and `ADMIN_SECRET` in `CLOUDFLARE_SECRET_NAMES`.

- [ ] **Step 7: Verify Phase B admin retirement code GREEN**

Run focused capability/shared/workflow tests, then `npm run build`, `npm test`, `npm run test:runtime`, root contract tests, secret scan, actionlint, and `git diff --check`.

- [ ] **Step 8: Commit legacy-removal code**

```bash
git add backend/src/middleware/auth.ts backend/src/types.ts backend/tests backend/scripts/shared.ts .github/workflows/backend-production-deploy.yml .github/workflows/backend-admin-capability-sync.yml scripts README.md backend/README.md RELEASE_RUNBOOK.md
git rm .github/workflows/backend-admin-secret-sync.yml
git commit -m "security: retire legacy admin authorization"
```
### Task 10: Phase B — Add an isolated production concurrency smoke

**Files:**
- Create: `backend/scripts/verify-rate-limit-production.ts`
- Create: `backend/tests/scripts/verifyRateLimitProduction.test.ts`
- Create: `.github/workflows/backend-rate-limit-smoke.yml`
- Create: `scripts/backend-rate-limit-smoke-workflow.test.mjs`
- Modify: `backend/src/services/rateLimit.ts` only to expose the already-reviewed chart policy to the verifier without changing its value.

**Interfaces:**
- The verifier imports the reviewed chart policy internally; it never prints limit/window values or live allow/reject counts.
- The workflow creates one temporary synthetic `users` row with random identifiers and no FCM, subscription, reward, or event rows, then signs an ephemeral HS256 app JWT in runner memory from `JWT_SECRET`.
- Live target is authenticated `POST /api/v1/chart/natal` with an intentionally invalid body. Admitted requests stop at backend-owned `400 INVALID_REQUEST` before chart computation; excess requests are backend-owned `429 RATE_LIMITED` with `Retry-After`.
- Because the limiter principal is the fresh synthetic user ID, the live burst cannot consume a customer or shared source-IP bucket. The synthetic row is deleted in an unconditional cleanup step and absence is independently read back.
- Public output is boolean/status-only: `strictRateLimitMatched`, `admittedRequestsHitValidation`, `rejectedRequestsWereRateLimited`, `retryAfterPresent`, `syntheticPrincipalIsolated`, `syntheticUserCleanupVerified`.

- [ ] **Step 1: Write RED verifier tests before the live script**

Refactor the existing reviewed route thresholds into an internal `RATE_LIMIT_POLICIES` export without changing any value. Test a pure `classifyLiveRateLimitResponses()` helper with synthetic responses so it accepts only this exact pattern: exactly the configured number of admitted responses are backend JSON `400/INVALID_REQUEST`, all excess responses are backend JSON `429/RATE_LIMITED`, and every `429` has `Retry-After`.

```ts
expect(result).toMatchObject({
  strictRateLimitMatched: true,
  admittedRequestsHitValidation: true,
  rejectedRequestsWereRateLimited: true,
  retryAfterPresent: true
});
```

Keep exact counts private to the test process. Add negative fixtures for upstream/non-JSON `400`/`429`, missing `Retry-After`, too many/few admitted responses, and any response that reaches successful chart computation.

- [ ] **Step 2: Run focused verifier tests and verify RED**

Run on MSI Ubuntu: `cd backend && npx vitest run tests/scripts/verifyRateLimitProduction.test.ts`.

Expected: FAIL because the production verifier/classifier does not exist yet.

- [ ] **Step 3: Implement the isolated live verifier**

`verify-rate-limit-production.ts` accepts the fixed backend base URL plus masked `VERIFY_USER_ID`, `VERIFY_FIREBASE_UID`, and `JWT_SECRET` from environment. Create a short-lived HS256 JWT with the same `user_id`, `firebase_uid`, and `is_premium=false` claims expected by `verifyAppJwt()`; do not print the token or identifiers.

Before the burst, read the public health response `Date` header and use the internal chart `windowSeconds` only in process memory. If the remaining fixed-window time is too short for a single burst, wait until just after the next boundary. Then send one concurrent burst larger than the configured chart limit to `/api/v1/chart/natal` with `Authorization: Bearer <ephemeral JWT>`, `content-type: application/json`, and `{}`. Parse every response and reject any response that is not backend-owned `400/INVALID_REQUEST` or `429/RATE_LIMITED` in the exact private count pattern.

The script writes only the boolean/status fields to stdout/GitHub output. It never prints the policy values, live counts, synthetic IDs, JWT, response bodies, request IDs, Durable Object identity, or bucket name.

- [ ] **Step 4: Add the guarded Ubuntu production smoke workflow**

Create `backend-rate-limit-smoke.yml` as `workflow_dispatch` only, main-only, `environment: production`, with typed confirmation `VERIFY_RATE_LIMIT`. Require `ENABLE_PRODUCTION_RELEASE=false` and exact checked-out `main` SHA. The GitHub-hosted job is Ubuntu-only.

Load only `JWT_SECRET` and `CLOUDFLARE_API_TOKEN` from the existing restricted Doppler production config; mask them immediately. The workflow must not load or reference `ADMIN_SECRET`, any scoped admin credential, Firebase/Play service-account JSON, purchase tokens, or customer JWTs.

Generate random synthetic user/Firebase identifiers in runner memory and mask both. With `umask 077`, write an insert SQL file under `$RUNNER_TEMP` that creates exactly one non-premium synthetic `users` row. Execute it remotely with Wrangler while redirecting raw CLI JSON away from logs. Do not create FCM, subscription, reward, or event rows.

Run the verifier, then use an `if: always()` cleanup step to execute a restricted delete SQL file matching both random identifiers. Read back only a zero/nonzero count and require `syntheticUserCleanupVerified=true`; remove SQL/result files regardless of success. If setup, verification, or cleanup cannot prove isolation, the workflow fails.

- [ ] **Step 5: Add workflow/source contracts and verify GREEN**

`scripts/backend-rate-limit-smoke-workflow.test.mjs` must assert main-only dispatch, release-gate false, Ubuntu host, temporary synthetic-user insert/delete with unconditional cleanup, no registration/source-IP probe, no admin/service-account/customer credentials, boolean-only published output, and no raw D1/HTTP response diagnostics.

Run: `cd backend && npx vitest run tests/scripts/verifyRateLimitProduction.test.ts`; from repo root run `node --test scripts/backend-rate-limit-smoke-workflow.test.mjs scripts/backend-rate-limit-contract.test.mjs`.

Expected: classifier and workflow isolation contracts pass; no live call is made by tests.

- [ ] **Step 6: Include the smoke in the Phase B local gate and commit**

Run the complete backend build/unit/runtime/transition suite, root contracts, secret scan, actionlint, audit, and `git diff --check` again after adding the workflow.

```bash
git add backend/src/services/rateLimit.ts backend/scripts/verify-rate-limit-production.ts backend/tests/scripts/verifyRateLimitProduction.test.ts .github/workflows/backend-rate-limit-smoke.yml scripts/backend-rate-limit-smoke-workflow.test.mjs
git commit -m "test: add isolated rate limit production smoke"
```
### Task 11: Phase B — Review, merge, deploy both Workers, and prove strict enforcement

**Files:**
- No new implementation files beyond Tasks 8–10.
- Restricted local state: Phase A main rollback version, pre-Phase-B transition version/settings, current scoped credential values; mode 0600 only and never committed.

**Interfaces:**
- Consumes: exact reviewed Phase B branch, permanent main `RateLimitBucket` namespace, Phase A scoped credentials, Phase A main rollback version.
- Produces: exact Phase B main Worker + transition Worker deployments, isolated synthetic-principal strict production concurrency proof, Phase B privilege matrix/audit proof, and capability revocation/restoration proof.
- Legacy `ADMIN_SECRET` remains present in secret stores during this task but runtime code no longer accepts it.

- [ ] **Step 1: Run the complete Phase B pre-PR gate from a fresh install**

Run root workflow/contract tests, secret scan, actionlint, `git diff --check`, then backend `npm ci`, build, full unit tests, main runtime tests, transition build/runtime tests, focused atomic concurrency tests, and `npm audit`. Require zero unexpected active legacy-admin references outside explicit negative tests/history docs.

- [ ] **Step 2: Open the Phase B same-repo PR and require exact-head review**

Push only to `MakerParsDev/Astroloji`. Require fresh Android, backend, secret-scan, Semgrep, GitGuardian, and CodeRabbit success for the exact head SHA. Read every actionable review thread; any fix push invalidates all prior check evidence.

- [ ] **Step 3: Merge only the exact reviewed Phase B head**

Use head-match protection, verify the merge parents independently, fetch `origin/main`, and create a detached clean production worktree at the exact merge SHA. Re-read `ENABLE_PRODUCTION_RELEASE` and require `false` before any deploy.
- [ ] **Step 4: Capture both rollback targets before Phase B deployment**

Verify the current 100%-active main Worker version equals the Phase A rollback version captured in Task 7. Capture the current transition Worker version, exact transition route ownership, and current `LEGACY_REWARD_FORWARD_UNTIL` setting into local mode-0600 state without printing any identifier or deadline. Abort on route ownership drift, missing transition state, or an unexpected active main version.

- [ ] **Step 5: Deploy the exact merged transition Worker while preserving its current deadline and route**

From the detached exact-main worktree, render the already-allowlisted temporary path `backend/.wrangler.transition.deploy.toml` with mode 0600 by replacing only the committed fail-closed deadline with the captured current production deadline. Keep the reviewed external binding:

```toml
[[durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimitBucket"
script_name = "astrology-backend"
```

Deploy route-free from `backend/` with `TRANSITION_WRANGLER_CONFIG=.wrangler.transition.deploy.toml npm run deploy:transition`; do not run the general transition workflow or change its route/deadline input. Then independently verify: exact transition script name, exact reward route still owned by that script, deadline unchanged, secret inventory unchanged, and `RATE_LIMITER` resolves to the main Worker namespace. Remove the rendered config in an `always`/trap cleanup. If any verification fails, roll the transition Worker back to the captured pre-Phase-B version and stop before touching the main Worker.

- [ ] **Step 6: Deploy the exact merged main Worker once**

Dispatch `backend-production-deploy.yml` from exact merged `main` exactly once. Require the run head SHA to equal the Phase B merge SHA and every build/test/migration/deploy/live-verification step to succeed. If the main deployment changes active state and then fails, restore the captured Phase A main version; also restore the pre-Phase-B transition version so both Workers return to the Phase A compatibility pair.
- [ ] **Step 7: Run the strict production concurrency smoke**

Dispatch `backend-rate-limit-smoke.yml` from exact Phase B `main`. Require a success run at the exact merge SHA and boolean-only results:

```text
strictRateLimitMatched=true
admittedRequestsHitValidation=true
rejectedRequestsWereRateLimited=true
retryAfterPresent=true
syntheticPrincipalIsolated=true
syntheticUserCleanupVerified=true
```

Require the workflow's unconditional D1 cleanup to verify the temporary synthetic user is absent before accepting the run. Do not publish or copy the observed allow/reject counts, configured threshold/window, synthetic identifiers/JWT, request IDs, Durable Object identity, or response bodies into issue/PR evidence; counts remain private to the verifier process.

- [ ] **Step 8: Repeat the full scoped privilege matrix after legacy removal**

Dispatch `backend-admin-capability-sync.yml` once per capability on exact Phase B `main`. Require each own row to reach its documented non-destructive auth-crossing status and all three cross-capability probes to return backend-owned `403/FORBIDDEN`.

Load the legacy `ADMIN_SECRET` from the still-existing restricted store into process memory only and probe the four representative capability endpoints. Every legacy probe must return backend-owned `403/FORBIDDEN`; do not print the credential or bodies.

- [ ] **Step 9: Re-prove sanitized Phase B audit telemetry**

Capture a short mode-0600 Cloudflare tail while triggering one authorized malformed scoped request and one rejected cross-capability request. Require `admin_operation` events with only allowlisted keys and both `authorized`/`rejected` outcomes. Assert the capture contains none of the scoped/legacy credential values or request bodies, then delete the capture.
- [ ] **Step 10: Prove one scoped credential can be revoked and restored independently**

Use `notification-ops` for the destructive-to-configuration/non-destructive-to-product proof. Preserve its current credential value only in the restricted local file and leave the GitHub environment copy intact.

1. Delete only the Cloudflare Worker binding `ADMIN_NOTIFICATION_SECRET` by name.
2. Probe `/notifications/send` with that previously valid notification credential and malformed JSON; require backend-owned `403/FORBIDDEN`.
3. Probe `/admin/content/backfill` with the independent current content credential and malformed JSON; require it still crosses auth to `400 INVALID_REQUEST`.
4. Dispatch the notification capability sync workflow to restore only `ADMIN_NOTIFICATION_SECRET` from `production-admin-notification`.
5. Re-probe malformed notification send and require `400 INVALID_REQUEST`.

At no point send a valid notification payload. Record only `notificationRevocationIsolated=true` and `notificationRestored=true`.

- [ ] **Step 11: Take a final pre-retirement production read-back**

Require: exact Phase B main and transition versions active; transition reward route ownership unchanged; external `RATE_LIMITER` binding present; all four scoped Worker secret names present; legacy `ADMIN_SECRET` still present by name but rejected by runtime; strict smoke success; four matrix rows true; audit allowlist true; release gate false.

Do not remove rollback files or scoped local credential material yet. Legacy secret retirement is a separate irreversible configuration step in Task 12.
### Task 12: Retire `ADMIN_SECRET` from every active control plane and prove it cannot return

**Files:**
- No code changes; Task 9 already removed active runtime/workflow/runbook references.
- Restricted local state only for control-plane commands and read-back; no secret value is written to evidence.

**Interfaces:**
- Consumes: fully verified Phase B runtime, scoped credentials, and Phase A rollback compatibility with scoped credentials.
- Produces: legacy admin secret absent from Cloudflare Worker secrets, GitHub production environment, and Doppler; generic deployment proven not to recreate it.

- [ ] **Step 1: Reconfirm retirement preconditions immediately before deletion**

Require exact Phase B merged `main`, release gate false, strict production smoke green, all four scoped capability rows green, legacy credential rejected by runtime, notification revocation/restoration proof green, and Phase A rollback tests proving scoped credentials work without legacy presence. Also require zero queued/in-progress runs of the historical `backend-admin-secret-sync` workflow and zero queued/in-progress `backend-production-deploy` runs whose head SHA is older than the Phase B merge.

Abort deletion if any condition is stale or false.

- [ ] **Step 2: Delete the legacy Cloudflare Worker secret and read it back by name**

Delete only `ADMIN_SECRET` from the main Worker. Re-list Worker secret names and require `legacyWorkerSecretAbsent=true` while all four scoped secret names remain present. Never print values.

- [ ] **Step 3: Delete the legacy GitHub production environment secret and read it back**

Delete `ADMIN_SECRET` from the `production` environment if present. Re-list environment secret names and require `legacyGitHubSecretAbsent=true`. Do not change the four capability-specific environments.
- [ ] **Step 4: Delete the legacy Doppler key and prove absence without reading a value**

Delete only `ADMIN_SECRET` from the reviewed backend Doppler config. A name lookup must then fail/not return the key; record only `legacyDopplerSecretAbsent=true`. Do not enumerate or print unrelated Doppler values.

- [ ] **Step 5: Re-run the generic backend deploy to prove retirement is durable**

Dispatch `backend-production-deploy.yml` again from the exact same Phase B `main` SHA. Require success without `ADMIN_SECRET` in Doppler and independently re-read Worker secret names afterward.

Acceptance after redeploy:

```text
legacyWorkerSecretAbsent=true
scopedWorkerSecretsReady=true
releaseGateFalse=true
```

This proves the generic deployment path neither requires nor recreates the retired credential and does not own the four scoped credentials.

- [ ] **Step 6: Re-run one strict limiter smoke and one scoped auth boundary after redeploy**

Run the guarded rate-limit smoke again and require all boolean checks true. Probe content-ops with malformed JSON and the current content credential; require backend-owned `400 INVALID_REQUEST`. Probe the retired legacy value only if still available in process memory; require `403/FORBIDDEN`, then discard that process-local value.

- [ ] **Step 7: Capture final retirement read-back and clean legacy-only temp state**

Record only the three legacy-absence booleans plus scoped-secret readiness. Delete any local temporary material containing the legacy credential. Keep Phase 0/Phase A rollback metadata and current scoped credential file until the evidence PR and issue closure complete.
### Task 13: Publish sanitized evidence, merge it, close #7, and clean restricted state

**Files:**
- Create: `docs/verification/atomic-rate-limiting-admin-least-privilege-2026-08-08.md`
- Create: `scripts/admin-rate-limit-verification-evidence.test.mjs`

**Interfaces:**
- Evidence may contain exact Git commit/merge SHAs, GitHub run numbers, test-suite pass counts, and sanitized boolean/status outcomes.
- Evidence must not contain production rate thresholds/windows, runner/client IP or principal, Durable Object IDs/names, Worker version IDs, transition deadline, credential values/fingerprints, privileged response bodies, customer/user IDs, purchase tokens, notification/review content, or raw telemetry.

- [ ] **Step 1: Start an evidence-only branch from fresh final `origin/main`**

Fetch current main after Task 12, require it equals the deployed reviewed Phase B source SHA, create a fresh same-repo worktree/branch, and verify it is clean before writing evidence.

- [ ] **Step 2: Write the evidence document from independent read-backs**

Map every #7 acceptance criterion to sanitized proof. Include the reviewed Phase 0/Phase A/Phase B PR heads and merge SHAs, production deploy/smoke run numbers, and booleans covering: lifecycle floor ready; four scoped rows isolated; source-free rotation passed; audit allowlist passed; strict concurrency matched; transition shares main limiter; legacy runtime rejected; scoped revocation isolated/restored; legacy absent from Cloudflare/GitHub/Doppler; generic redeploy did not recreate legacy; release gate remained false.

Do not include the numeric quota, window, live allow/reject counts, or any control-plane identifier.

- [ ] **Step 3: Add a leakage/contract test for the evidence artifact**

`admin-rate-limit-verification-evidence.test.mjs` reads the evidence file and requires the named sanitized proof fields while rejecting credential assignments/headers, IPv4/IPv6 principal evidence, `ratelimit:`/bucket/object identifiers, transition deadline strings, Worker version identifiers, raw notification/review bodies, and any line that publishes a configured rate-limit number/window.
- [ ] **Step 4: Run the evidence-only local gate**

Run the new evidence contract, repository secret scan, all root contract tests, and `git diff --check`. Require the branch diff to contain only the evidence document and its evidence-contract test.

- [ ] **Step 5: Commit and open the same-repo evidence PR**

```bash
git add docs/verification/atomic-rate-limiting-admin-least-privilege-2026-08-08.md scripts/admin-rate-limit-verification-evidence.test.mjs
git commit -m "docs: record rate limit and admin hardening verification"
```

Push to `MakerParsDev/Astroloji`, open the PR against `main`, and require exact-head Android/backend/secret-scan/Semgrep/GitGuardian/CodeRabbit success. Resolve every actionable review before merge; any push invalidates previous checks.

- [ ] **Step 6: Merge the exact reviewed evidence head and verify merge parents**

Use head-match protection, fetch `origin/main`, and verify the evidence PR merge second parent is the exact reviewed evidence head. Take one final production read-back from the merged main state; docs-only merge must not change runtime state, scoped secret readiness, strict limiter status, or release gate.

- [ ] **Step 7: Close #7 only after evidence merge and independent issue read-back**

Post a sanitized completion comment referencing the merged evidence path and high-level outcomes only. Close issue #7 as completed, then independently re-read issue state and milestone #1; require #7 closed and the milestone checkbox updated to `[x]`.

- [ ] **Step 8: Remove #7 restricted local state after closure**

Delete the scoped credential file, Phase 0/Phase A rollback-version metadata, transition pre-Phase-B metadata, temporary rendered configs, tail captures, and any other #7-only secret/control-plane temp files. Verify their exact paths are absent. Leave the Durable Object namespace and four scoped production credentials provisioned as permanent infrastructure.

Do not delete or modify unrelated project worktrees, credentials, rollout state, subscription configuration, RTDN configuration, or customer data.
