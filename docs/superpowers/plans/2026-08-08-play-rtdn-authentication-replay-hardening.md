# Google Play RTDN Authentication and Replay Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace shared-secret Google Play RTDN ingestion with Google-signed Pub/Sub push identity, package binding, and race-safe message idempotency, then remove the legacy secret only after authenticated production delivery is proven.

**Architecture:** Phase A adds Google OIDC verification, strict Pub/Sub envelope/package parsing, an additive D1 delivery-claim table, transactional RTDN state writes, and a temporary legacy-auth fallback. After a real authenticated Google delivery is proven in production, Phase B removes query/header shared-secret auth and deletes the obsolete Worker/Doppler secret. A final documentation-only PR records sanitized evidence and closes #6.

**Tech Stack:** TypeScript 5.9, Hono, `jose` 6.1, Cloudflare Workers + D1, Wrangler 4.118+, Vitest 3.2, GitHub Actions, Google Cloud Pub/Sub/gcloud.

## Global Constraints

- Repository is `MakerParsDev/Astroloji`; Git identity is `MakerParsDev <makerpars@gmail.com>`.
- Work from a fresh/current `origin/main` worktree; never use the stale desktop checkout or removed screenshot worktree.
- Keep the existing route `POST /api/v1/webhooks/play-rtdn`; do not add a second webhook route.
- Final authentication is Google-signed OIDC only: verify signature, accepted Google issuer, exact audience, expiry/time validity, exact configured caller email, and `email_verified === true`.
- `PLAY_RTDN_AUDIENCE` and `PLAY_RTDN_SERVICE_ACCOUNT_EMAIL` are server-side non-secret configuration; do not commit their production values.
- Final code must not accept `?token=` or `X-Play-Secret` and must remove `PLAY_WEBHOOK_SECRET` from active Worker/config secret inventory.
- RTDN package identity must exactly match server `PACKAGE_NAME` before Play API lookup or entitlement mutation.
- D1 idempotency must be uniqueness-enforced and race-safe; a read-then-insert claim is not acceptable.
- Never log or disclose publicly bearer JWTs, shared secrets, purchase tokens, raw RTDN data, full service-account identifiers, or full Pub/Sub message IDs. The expected caller email may exist only as restricted server-side configuration, and the full Pub/Sub `message_id` may exist only as the internal D1 dedupe primary key; neither appears in logs or public evidence.
- No Play rollout percentage, subscription product/price, purchase/refund state, or customer entitlement may be manually changed during this work.
- Phase A and Phase B are separate reviewed PRs/deploys; production mutations happen only from the exact merged `main` SHA for that phase.
- Production release gate `ENABLE_PRODUCTION_RELEASE` remains `false`; unrelated production rollout/subscription controls stay untouched.
- Authenticated Pub/Sub permanent rejection must have bounded dead-letter behavior before OIDC-only cutover.

## File Structure

**Phase A creates:**
- `backend/src/services/playRtdnAuth.ts` — Google OIDC key resolution and claim verification only.
- `backend/src/services/playRtdnDelivery.ts` — Pub/Sub envelope decode, developer-notification validation, fingerprinting, D1 claim/finalize/release helpers, and sanitized message reference.
- `backend/tests/services/playRtdnAuth.test.ts` — generated-key OIDC verifier tests with no network or production identifiers.
- `backend/tests/services/playRtdnDelivery.test.ts` — parser/fingerprint/atomic-claim tests.
- `backend/migrations/0002_play_rtdn_messages.sql` — additive production D1 migration.
- `backend/scripts/deploy-worker.ts` — fail-closed Wrangler deploy argument builder for the two non-secret RTDN runtime vars.
- `backend/tests/scripts/deployWorker.test.ts` — deploy config contract.
- `scripts/backend-play-rtdn-workflow.test.mjs` — active deployment/smoke workflow contract.

**Phase A modifies:**
- `backend/src/middleware/auth.ts` — OIDC-first authentication with temporary legacy fallback.
- `backend/src/workers/subscription.ts` — strict envelope/package handling, test notification no-op, idempotent claims, transactional RTDN writes, sparse audit logs.
- `backend/src/index.ts` — inject RTDN auth dependency for deterministic tests.
- `backend/src/types.ts`, `backend/tests/helpers/env.ts`, `backend/tests/runtime/worker-runtime.test.ts` — new config/types/runtime fixtures.
- `backend/schema.sql` — fresh-database form of `play_rtdn_messages`.
- `backend/package.json` — deployment script wiring only; no new dependency is required.
- `.github/workflows/backend-production-deploy.yml` — require RTDN vars, apply/read back migration before deploy.
- `.github/workflows/backend-play-webhook-smoke.yml` — compatibility boundary checks without exposing secrets.
- `backend/README.md` — Phase A operator contract and authoritative-lookup behavior.
**Phase B modifies/removes active legacy references from:**
- `backend/src/middleware/auth.ts`, `backend/src/types.ts`, `backend/scripts/shared.ts`, `backend/tests/helpers/env.ts`.
- `backend/tests/workers/subscription.test.ts`, `backend/tests/runtime/worker-runtime.test.ts`, `backend/tests/scripts/shared.test.ts`.
- `.github/workflows/backend-production-deploy.yml`, `.github/workflows/backend-play-webhook-smoke.yml`.
- `backend/README.md`, `scripts/backend-play-rtdn-workflow.test.mjs`.

**Final evidence creates:**
- `docs/verification/play-rtdn-authentication-replay-hardening-2026-08-08.md` — allowlisted production evidence only.

## Reference Behavior

Official references used by this plan:
- Google Pub/Sub authenticated push: `https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions`
- Pub/Sub push acknowledgement/retry: `https://docs.cloud.google.com/pubsub/docs/push`
- Pub/Sub dead-letter configuration: `https://docs.cloud.google.com/pubsub/docs/dead-letter-topics`
- Google OIDC validation/JWKS: `https://developers.google.com/identity/openid-connect/openid-connect`
- Google Play RTDN setup: `https://developer.android.com/google/play/billing/getting-ready`
- Google Play RTDN envelope/reference: `https://developer.android.com/google/play/billing/rtdn-reference`
- D1 transactional batch semantics: `https://developers.cloudflare.com/d1/worker-api/d1-database/#batch`

---

### Task 1: Phase A Google OIDC Verifier and Compatibility Authentication

**Files:**
- Create: `backend/src/services/playRtdnAuth.ts`
- Create: `backend/tests/services/playRtdnAuth.test.ts`
- Modify: `backend/src/middleware/auth.ts`
- Modify: `backend/src/types.ts`
- Modify: `backend/tests/helpers/env.ts`
**Interfaces:**
- Consumes: existing `getBearerToken()`, `matchesSecret()`, `Env.CACHE`.
- Produces:
  - `verifyPlayRtdnIdentity(env, token, dependencies?): Promise<void>`
  - `PlayRtdnAuthDependencies = { resolveVerificationKey?: (token: string, env: Pick<Env, 'CACHE'>) => Promise<CryptoKey> }`
  - `requirePlayWebhookAuth(c, verifyIdentity?): Promise<{ method: 'oidc' | 'legacy' } | Response>` during Phase A.

- [ ] **Step 1: Add the RTDN non-secret bindings and test fixtures**

In `backend/src/types.ts`, keep the legacy secret for Phase A and add:

```ts
interface RuntimeConfigBindings {
  PLAY_RTDN_AUDIENCE: string;
  PLAY_RTDN_SERVICE_ACCOUNT_EMAIL: string;
}

export type Env = CloudflareEnv & SecretBindings & RuntimeConfigBindings;
```

In `backend/tests/helpers/env.ts`, use only synthetic values:

```ts
PLAY_RTDN_AUDIENCE: 'https://example.test/api/v1/webhooks/play-rtdn',
PLAY_RTDN_SERVICE_ACCOUNT_EMAIL: 'play-rtdn-push@example-project.iam.gserviceaccount.com',
```

- [ ] **Step 2: Write failing generated-key OIDC tests**

Use `jose.generateKeyPair()` and `SignJWT` so claim-validation tests never call Google or contain production values. Cover valid signature/issuer/audience/email, wrong issuer, wrong audience, expired token, wrong email, `email_verified: false`, missing `kid`, and malformed JWT. Add separate mocked-`fetch`/fake-KV tests proving a cached JWKS avoids a network call, an unknown `kid` forces exactly one refresh, and an unresolved `kid` fails closed.
Representative test helper:

```ts
async function signGoogleToken(overrides: Record<string, unknown> = {}) {
  return new SignJWT({
    email: 'play-rtdn-push@example-project.iam.gserviceaccount.com',
    email_verified: true,
    ...overrides
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })
    .setIssuer('https://accounts.google.com')
    .setAudience('https://example.test/api/v1/webhooks/play-rtdn')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}
```

Run:

```bash
cd backend
npm test -- --run tests/services/playRtdnAuth.test.ts
```

Expected: FAIL because `playRtdnAuth.ts` does not exist.

- [ ] **Step 3: Implement minimal Google OIDC verification**

Use exact constants:

```ts
const PLAY_RTDN_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const PLAY_RTDN_JWKS_CACHE_KEY = 'play_rtdn_google_jwks';
const PLAY_RTDN_JWKS_CACHE_TTL_SECONDS = 3600;
```

Resolve `kid`, import only an RSA key with `importJWK(jwk, 'RS256')`, cache the JWKS in `env.CACHE` for 3600 seconds, refresh exactly once when a `kid` is not present, then call `jwtVerify()` with:

```ts
{
  algorithms: ['RS256'],
  issuer: ['https://accounts.google.com', 'accounts.google.com'],
  audience: env.PLAY_RTDN_AUDIENCE,
}
```
After `jwtVerify`, require:

```ts
if (payload.email !== env.PLAY_RTDN_SERVICE_ACCOUNT_EMAIL || payload.email_verified !== true) {
  throw new Error('Play RTDN caller identity is invalid.');
}
```

Do not return/log the token or caller email.

- [ ] **Step 4: Add OIDC-first compatibility auth to `auth.ts`**

Phase A behavior is exact:

```ts
const bearer = getBearerToken(c.req.header('authorization'));
if (bearer) {
  try {
    await verifyIdentity(c.env, bearer);
    return { method: 'oidc' };
  } catch {
    return jsonError(c, 403, 'FORBIDDEN', 'Play webhook identity is invalid.');
  }
}

const querySecret = new URL(c.req.url).searchParams.get('token');
const legacySecret = querySecret ?? c.req.header('x-play-secret');
if (matchesSecret(c.env.PLAY_WEBHOOK_SECRET, legacySecret)) return { method: 'legacy' };
return jsonError(c, 403, 'FORBIDDEN', 'Play webhook identity is invalid.');
```

An invalid bearer **must not** downgrade to a valid legacy secret.

- [ ] **Step 5: Run focused auth tests and build**

```bash
cd backend
npm test -- --run tests/services/playRtdnAuth.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add backend/src/services/playRtdnAuth.ts backend/tests/services/playRtdnAuth.test.ts backend/src/middleware/auth.ts backend/src/types.ts backend/tests/helpers/env.ts
git commit -m "feat(backend): verify Play RTDN push identity"
```

### Task 2: Strict Pub/Sub Envelope, Developer Notification, and Fingerprint Parsing

**Files:**
- Create: `backend/src/services/playRtdnDelivery.ts`
- Create: `backend/tests/services/playRtdnDelivery.test.ts`

**Interfaces:**
- Produces:
  - `parsePlayRtdnEnvelope(payload: unknown): ParsedPlayRtdnMessage`
  - `fingerprintPlayRtdnMessage(packageName: string, decodedBytes: Uint8Array): Promise<string>`
  - `shortPlayRtdnMessageRef(messageId: string): Promise<string>`
  - `ParsedPlayRtdnMessage` union with `kind: 'subscription' | 'test'`.

- [ ] **Step 1: Write failing parser tests**

Required success fixture:

```ts
const developerNotification = {
  version: '1.0',
  packageName: 'com.example.astrology',
  eventTimeMillis: '1786147200000',
  testNotification: { version: '1.0' }
};
const envelope = {
  message: {
    messageId: 'message-1',
    data: btoa(JSON.stringify(developerNotification))
  }
};
```

Assert strict failure for missing/empty `messageId`, missing `data`, invalid base64, invalid UTF-8/JSON, missing package, and unsupported notification form.
For subscription messages require a non-empty purchase token, subscription ID, and supported notification type. For `testNotification`, produce a no-op message that never touches subscription/customer state.

Run:

```bash
cd backend
npm test -- --run tests/services/playRtdnDelivery.test.ts
```

Expected: FAIL because parser functions do not exist.

- [ ] **Step 2: Implement strict decode and typed output**

Define:

```ts
export type ParsedPlayRtdnMessage =
  | {
      kind: 'test'; messageId: string; packageName: string;
      decodedBytes: Uint8Array; notificationType: 'test';
    }
  | {
      kind: 'subscription'; messageId: string; packageName: string;
      decodedBytes: Uint8Array; purchaseToken: string; productId: string;
      notificationType: number | string;
    };
```

Use `atob()` plus `TextDecoder('utf-8', { fatal: true })`; do not accept payload unwrapping or alternate request-selected package fields.

- [ ] **Step 3: Implement deterministic hashes**

Fingerprint input is exactly UTF-8 `packageName`, one `0x00` separator byte, then the decoded developer-notification bytes. Hash with `crypto.subtle.digest('SHA-256', ...)` and encode lowercase hex.

`shortPlayRtdnMessageRef()` separately SHA-256 hashes the Pub/Sub message ID and returns only the first 12 hex characters for logs.

- [ ] **Step 4: Run parser tests**

```bash
cd backend
npm test -- --run tests/services/playRtdnDelivery.test.ts
```

Expected: PASS, including stable fingerprint and stable 12-character log reference.

- [ ] **Step 5: Commit Task 2**

```bash
git add backend/src/services/playRtdnDelivery.ts backend/tests/services/playRtdnDelivery.test.ts
git commit -m "feat(backend): parse Play RTDN deliveries strictly"
```

### Task 3: Additive D1 Idempotency Schema and Atomic Claim Lifecycle

**Files:**
- Create: `backend/migrations/0002_play_rtdn_messages.sql`
- Modify: `backend/schema.sql`
- Modify: `backend/src/services/playRtdnDelivery.ts`
- Modify: `backend/tests/services/playRtdnDelivery.test.ts`
- Modify: `backend/src/types.ts`

**Interfaces:**
- Produces:
  - `claimPlayRtdnMessage(db, input): Promise<PlayRtdnClaimResult>`
  - `releasePlayRtdnClaim(db, messageId, fingerprint, leaseToken): Promise<void>`
  - `finalizePlayRtdnMessage(db, messageId, fingerprint, leaseToken, outcome, processedAt?): Promise<void>`
  - `createPlayRtdnFinalizeStatement(db, messageId, fingerprint, leaseToken, outcome, processedAt): D1PreparedStatement`
- `PlayRtdnClaimResult` is exactly `claimed | duplicate_processed | duplicate_processing | mismatch`.

- [ ] **Step 1: Write migration contract and failing claim tests**

The migration/fresh schema table is:

```sql
CREATE TABLE IF NOT EXISTS play_rtdn_messages (
  message_id TEXT PRIMARY KEY NOT NULL,
  package_name TEXT NOT NULL,
  message_fingerprint TEXT NOT NULL,
  notification_type TEXT,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed')),
  lease_token TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  outcome TEXT
);
```
Also add:

```sql
CREATE INDEX IF NOT EXISTS idx_play_rtdn_messages_received_at
  ON play_rtdn_messages(received_at);
```

No purchase token or raw payload column is permitted.

Tests must prove:
- first `message_id` inserts `processing` and returns `claimed`;
- uniqueness conflict + same fingerprint/status `processed` returns `duplicate_processed`;
- same fingerprint/status `processing` with an unexpired 60-second lease returns `duplicate_processing`;
- an expired processing lease is atomically reclaimed with a new `lease_token` and expiry and returns `claimed`;
- same ID with different package or fingerprint returns `mismatch`;
- release deletes only the exact still-`processing` lease owner;
- finalize requires exact fingerprint, lease token, processing status, and an unexpired lease;
- after stale takeover the old lease cannot release, finalize, or mutate customer state.

Run and expect RED:

```bash
cd backend
npm test -- --run tests/services/playRtdnDelivery.test.ts
```

- [ ] **Step 2: Implement uniqueness-enforced claim**

Use one `INSERT ... ON CONFLICT(message_id) DO NOTHING` and inspect `meta.changes`. Only after a uniqueness conflict may code read the existing row to classify duplicate versus mismatch.
Input signature:

```ts
export interface PlayRtdnClaimInput {
  messageId: string;
  packageName: string;
  fingerprint: string;
  notificationType: string;
  leaseToken: string;
  receivedAt: string;
}
```

Never implement claim as `SELECT` followed by unconditional `INSERT`.

- [ ] **Step 3: Implement conditional release/finalize helpers**

Release SQL must include all guards:

```sql
DELETE FROM play_rtdn_messages
WHERE message_id = ? AND message_fingerprint = ? AND lease_token = ? AND status = 'processing'
```

Finalize SQL must include `message_id`, fingerprint, exact `lease_token`, `status='processing'`, and `lease_expires_at > processedAt` guards while setting `status='processed'`, `processed_at`, and bounded `outcome`. Require `meta.changes === 1` for standalone finalize. Conflict handling may atomically replace an expired lease only when the same package/fingerprint still owns a `processing` row.

- [ ] **Step 4: Apply migration to an isolated local D1 and verify schema**

```bash
cd backend
rm -rf .wrangler/state/v3/d1
npx wrangler d1 migrations apply astrology-db --local
npx wrangler d1 execute astrology-db --local --command "PRAGMA table_info(play_rtdn_messages)" --json
```

Expected: columns exactly include the ten planned fields, `message_id` is the primary key, both lease columns are NOT NULL, the status CHECK exists, and the `received_at` index is present.
- [ ] **Step 5: Run focused tests and build**

```bash
cd backend
npm test -- --run tests/services/playRtdnDelivery.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add backend/migrations/0002_play_rtdn_messages.sql backend/schema.sql backend/src/services/playRtdnDelivery.ts backend/tests/services/playRtdnDelivery.test.ts backend/src/types.ts
git commit -m "feat(backend): add Play RTDN delivery claims"
```

### Task 4: Integrate Idempotent RTDN Processing with Transactional D1 State Writes

**Files:**
- Modify: `backend/src/workers/subscription.ts`
- Modify: `backend/src/index.ts`
- Modify: `backend/tests/workers/subscription.test.ts`
- Modify: `backend/tests/runtime/worker-runtime.test.ts`

**Interfaces:**
- `registerSubscriptionRoutes(app, dependencies?)` consumes `verifyPlayRtdnIdentity`, parser, claim helpers, and existing `getSubscriptionStatus()`.
- Produces exact route outcomes for `test`, first subscription delivery, duplicate, retryable failure, package mismatch, and malformed payload.

- [ ] **Step 1: Add dependency injection without changing verify/restore routes**
Define in `subscription.ts`:

```ts
export interface SubscriptionRouteDependencies {
  verifyPlayRtdnIdentity: typeof verifyPlayRtdnIdentity;
}

const defaultSubscriptionRouteDependencies: SubscriptionRouteDependencies = {
  verifyPlayRtdnIdentity,
};
```

Extend `CreateAppOptions` in `index.ts` with optional `subscription`, and pass it only to `registerSubscriptionRoutes`. Existing callers without options remain unchanged.

- [ ] **Step 2: Replace old direct RTDN payload tests with failing official-envelope tests**

Use a helper that builds:

```ts
function playPushEnvelope(messageId: string, notification: unknown) {
  return {
    message: {
      messageId,
      data: btoa(JSON.stringify(notification)),
    },
  };
}
```

Inject an identity verifier mock that resolves for OIDC tests; retain separate Phase A tests for query/header legacy fallback.

Add RED tests for:
- valid OIDC test notification => 200, no Play call, no customer-state write;
- package mismatch => rejection before `getSubscriptionStatus`;
- first subscription delivery => one authoritative Play lookup and one business transition;
- processed duplicate => 200 and no second Play lookup/business write;
- processing duplicate => retryable non-2xx;
- same message ID/different fingerprint => rejection and no Play lookup;
- stale processing lease => atomically reclaimed with a new lease token; transient Play/OAuth failure => exact current lease released and 500/retryable;
- lease ownership lost before the transactional batch => every customer-state statement applies zero rows and route returns retryable failure;
- invalid bearer + valid legacy secret => 403, proving no auth downgrade.
Run RED:

```bash
cd backend
npm test -- --run tests/workers/subscription.test.ts
```

- [ ] **Step 3: Authenticate before body parsing and enforce package match**

The route order is fixed:

```text
authenticate -> parse envelope -> compare package -> fingerprint -> atomic claim -> Play lookup/business handling
```

If `parsed.packageName !== c.env.PACKAGE_NAME`, return a permanent rejection before calling Play or claiming the message.

- [ ] **Step 4: Handle safe `testNotification` as a processed no-op**

After a successful claim for `kind === 'test'`, call `finalizePlayRtdnMessage(..., leaseToken, 'test')` and return `{ ok: true, test: true }`. This is the production transport/auth proof path and must not query subscriptions or update users.

- [ ] **Step 5: Make successful subscription state writes transactional with message finalization**

Do not reuse the existing multi-call `processSubscription()` for RTDN because a crash between its writes and message finalization could cause duplicate events on retry. For RTDN only, build a D1 `batch()` containing:

```text
1. lease-guarded INSERT subscriptions ... ON CONFLICT(purchase_token) DO UPDATE ...
2. lease-guarded UPDATE users SET is_premium/subscription_state/premium_expires_at/last_seen_at ...
3. lease-guarded INSERT subscription_events ...
4. UPDATE play_rtdn_messages SET status='processed', processed_at=?, outcome=? WHERE message_id=? AND message_fingerprint=? AND lease_token=? AND status='processing' AND lease_expires_at > ?
```

Cloudflare D1 `batch()` is transactional when a statement fails, but a zero-row guarded UPDATE is still a successful statement. Therefore every customer-state statement must carry the same `message_id`/fingerprint/lease-token/unexpired-lease `EXISTS` guard. If the finalizer reports `changes=0`, emit a bounded `retryable_failure` consistency alarm before throwing; do not assume the zero-row finalizer itself rolled back prior statements.
For the existing `liveSubscription === null` reconciliation path, batch the `sync_pending` event insert and RTDN message finalization together. For `!userId && !liveSubscription`, finalize with bounded outcome `ignored_unknown_purchase` and return 200. For `!userId && liveSubscription`, release the processing claim and keep a retryable/non-2xx response.

- [ ] **Step 6: Release only unprocessed claims on exceptions**

Wrap the post-claim processing block:

```ts
try {
  // authoritative lookup + transactional success path
} catch (error) {
  await releasePlayRtdnClaim(c.env.DB, parsed.messageId, fingerprint, leaseToken);
  throw error;
}
```

Never release after a successful transactional finalization, and never release another worker's reclaimed lease: release is fenced by the exact `leaseToken`.

- [ ] **Step 7: Add sparse structured audit logs**

Emit one bounded object per terminal path, for example:

```ts
console.log({
  event: 'play_rtdn',
  requestId: c.get('requestId'),
  messageRef,
  auth: authResult.method,
  packageMatch: true,
  notificationClass: parsed.kind,
  outcome: 'processed',
});
```

Tests must spy on `console.log` and assert serialized logs do not contain the bearer fixture, legacy secret, purchase-token fixture, raw encoded body, full message ID, or caller email.

- [ ] **Step 8: Update runtime smoke fixtures for Phase A**

Runtime env gets synthetic `PLAY_RTDN_AUDIENCE`/`PLAY_RTDN_SERVICE_ACCOUNT_EMAIL`. Keep a legacy-header invalid-payload test for compatibility and add unauthenticated rejection. Positive OIDC cryptography remains unit-tested; production positive proof comes from actual Pub/Sub.
- [ ] **Step 9: Run focused and full backend gates**

```bash
cd backend
npm test -- --run tests/services/playRtdnAuth.test.ts tests/services/playRtdnDelivery.test.ts tests/workers/subscription.test.ts
npm run build
npm test
npm run test:runtime
```

Expected: all PASS.

- [ ] **Step 10: Commit Task 4**

```bash
git add backend/src/workers/subscription.ts backend/src/index.ts backend/tests/workers/subscription.test.ts backend/tests/runtime/worker-runtime.test.ts
git commit -m "feat(backend): process Play RTDN idempotently"
```

### Task 5: Phase A Production Deploy Configuration, Workflow Contracts, and Documentation

**Files:**
- Create: `backend/scripts/deploy-worker.ts`
- Create: `backend/tests/scripts/deployWorker.test.ts`
- Create: `scripts/backend-play-rtdn-workflow.test.mjs`
- Modify: `backend/package.json`
- Modify: `.github/workflows/backend-production-deploy.yml`
- Modify: `.github/workflows/backend-play-webhook-smoke.yml`
- Modify: `backend/README.md`

**Interfaces:**
- `buildWorkerDeployArgs(environment): string[]` requires both RTDN non-secret vars and passes them to Wrangler `--var`; the helper never logs arguments, and the production workflow masks both values before Wrangler runs because Wrangler prints plain-var values in deployment output.
- Production workflow applies/read-backs `0002_play_rtdn_messages.sql` before Worker deployment.
- [ ] **Step 1: Write failing deploy/workflow contract tests**

`deployWorker.test.ts` must prove missing either runtime var throws before Wrangler is invoked and produced args include:

```ts
[
  'wrangler', 'deploy',
  '--var', `PLAY_RTDN_AUDIENCE:${environment.PLAY_RTDN_AUDIENCE}`,
  '--var', `PLAY_RTDN_SERVICE_ACCOUNT_EMAIL:${environment.PLAY_RTDN_SERVICE_ACCOUNT_EMAIL}`,
]
```

`backend-play-rtdn-workflow.test.mjs` must require Phase A workflow markers:
- production env vars source from `${{ vars.PLAY_RTDN_AUDIENCE }}` and `${{ vars.PLAY_RTDN_SERVICE_ACCOUNT_EMAIL }}`;
- tracked migrations occur before deploy;
- a schema read-back occurs after migrations and before deploy;
- both RTDN runtime values are registered with GitHub `::add-mask::` before `npm run deploy:doppler`;
- no RTDN value is echoed to summaries/logs;
- smoke still tests unauthenticated `403` and temporary legacy invalid-payload `400`.

Run RED:

```bash
node --test scripts/backend-play-rtdn-workflow.test.mjs
cd backend
npm test -- --run tests/scripts/deployWorker.test.ts
```

- [ ] **Step 2: Implement `deploy-worker.ts` and package wiring**

Export the pure argument builder for tests; CLI `main()` invokes local `npx wrangler deploy` with those args. Change only:

```json
"deploy:doppler": "npm run doppler:cf-secrets && tsx scripts/deploy-worker.ts"
```
- [ ] **Step 3: Make production workflow require non-secret RTDN vars**

Add to job `env`:

```yaml
PLAY_RTDN_AUDIENCE: ${{ vars.PLAY_RTDN_AUDIENCE }}
PLAY_RTDN_SERVICE_ACCOUNT_EMAIL: ${{ vars.PLAY_RTDN_SERVICE_ACCOUNT_EMAIL }}
```

Add both names to `Validate deployment configuration`. Keep `PLAY_WEBHOOK_SECRET` in the Phase A Doppler required-secret list. Immediately after validation, before any command that can render Wrangler bindings, add:

```bash
echo "::add-mask::$PLAY_RTDN_AUDIENCE"
echo "::add-mask::$PLAY_RTDN_SERVICE_ACCOUNT_EMAIL"
```

The workflow contract test must assert both mask commands occur before `npm run deploy:doppler`. The values remain ordinary Worker vars; masking is only a GitHub log-protection measure.

After `Apply tracked D1 migrations`, add a read-only schema assertion:

```bash
npx wrangler d1 execute astrology-db --remote \
  --command "PRAGMA table_info(play_rtdn_messages); PRAGMA index_list(play_rtdn_messages); SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'play_rtdn_messages';" --json \
  > "$RUNNER_TEMP/play-rtdn-schema.json"
node - <<'NODE'
const fs = require('node:fs');
const payload = JSON.parse(fs.readFileSync(process.env.RUNNER_TEMP + '/play-rtdn-schema.json', 'utf8'));
const resultSets = payload.map((entry) => entry.results ?? []);
const columns = resultSets.find((rows) => rows.some((row) => Object.hasOwn(row, 'cid'))) ?? [];
const indexes = resultSets.find((rows) => rows.some((row) => Object.hasOwn(row, 'origin'))) ?? [];
const schemaRows = resultSets.find((rows) => rows.some((row) => typeof row.sql === 'string')) ?? [];
const expectedColumns = [
  ['message_id', 'TEXT', 1, 1], ['package_name', 'TEXT', 1, 0],
  ['message_fingerprint', 'TEXT', 1, 0], ['notification_type', 'TEXT', 0, 0],
  ['status', 'TEXT', 1, 0], ['lease_token', 'TEXT', 1, 0],
  ['lease_expires_at', 'TEXT', 1, 0], ['received_at', 'TEXT', 1, 0],
  ['processed_at', 'TEXT', 0, 0], ['outcome', 'TEXT', 0, 0],
];
if (columns.length !== expectedColumns.length) throw new Error('Play RTDN schema column count mismatch.');
for (const [name, type, notnull, pk] of expectedColumns) {
  const row = columns.find((candidate) => candidate.name === name);
  if (!row || row.type !== type || Number(row.notnull) !== notnull || Number(row.pk) !== pk) {
    throw new Error(`Play RTDN schema mismatch for ${name}.`);
  }
}
if (!indexes.some((row) => row.name === 'idx_play_rtdn_messages_received_at')) throw new Error('Play RTDN received_at index is missing.');
if (!indexes.some((row) => Number(row.unique) === 1 && row.origin === 'pk')) throw new Error('Play RTDN primary-key uniqueness is missing.');
const tableSql = schemaRows[0]?.sql?.replace(/\s+/g, ' ') ?? '';
if (!tableSql.includes("CHECK (status IN ('processing', 'processed'))")) throw new Error('Play RTDN status CHECK is missing.');
console.log('Play RTDN schema read-back passed.');
NODE
```

Remove the temporary schema JSON in the existing `if: always()` cleanup step.

- [ ] **Step 4: Keep the Phase A smoke deliberately compatibility-only**

The workflow may load/mask `PLAY_WEBHOOK_SECRET` during Phase A, but summaries may only report status classes. Test missing auth => 403 and valid legacy header + `{}` => 400. Do not add a fake positive OIDC production claim.
- [ ] **Step 5: Update Phase A README wording**

Document:
- OIDC is preferred and validates Google identity before payload parsing;
- query/header secret exists only as temporary migration fallback;
- official Pub/Sub envelope/message ID/package are mandatory for OIDC deliveries;
- Google Play API remains authoritative for subscription state;
- `testNotification` is a no-op transport/auth check;
- no production identifiers belong in public docs.

Do not describe Phase A fallback as the final security state.

- [ ] **Step 6: Run Phase A pre-PR gates**

```bash
node --test scripts/*.test.mjs
node scripts/scan-secrets.mjs
cd backend
npm ci
npm run build
npm test
npm run test:runtime
npm run build:transition
npm run test:runtime:transition
npm audit --audit-level=high
cd ..
git diff --check origin/main...HEAD
git status --short
```

Expected: all green; only planned files changed; no generated secret/config file tracked.

- [ ] **Step 7: Commit Task 5**

```bash
git add backend/scripts/deploy-worker.ts backend/tests/scripts/deployWorker.test.ts backend/package.json .github/workflows/backend-production-deploy.yml .github/workflows/backend-play-webhook-smoke.yml scripts/backend-play-rtdn-workflow.test.mjs backend/README.md
git commit -m "ci: prepare authenticated Play RTDN rollout"
```

Do not stage unrelated files.

### Task 6: Phase A Same-Repository PR, Exact-Head Review, and Merge

**Files:** no new implementation files; this is a delivery gate.

**Interfaces:**
- Consumes: completed Tasks 1–5.
- Produces: one exact reviewed Phase A `main` SHA eligible for production rollout.

- [ ] **Step 1: Re-fetch base and verify identity/invariants**

```bash
git fetch origin main
git config user.name MakerParsDev
git config user.email makerpars@gmail.com
test "$(gh api user --jq .login)" = "MakerParsDev"
test "$(git remote get-url origin)" = "https://github.com/MakerParsDev/Astroloji.git"
git status --short
```

If `origin/main` advanced independently, rebase/merge only after rerunning all Phase A gates; do not push a stale base blindly.

- [ ] **Step 2: Push the current same-repo branch and open Phase A PR**

```bash
git push -u origin HEAD
PR_URL="$(gh pr create --repo MakerParsDev/Astroloji --base main --head "$(git branch --show-current)" --title "feat: harden Play RTDN authenticated delivery" --body "Phase A for #6: Google-signed Pub/Sub identity, strict package binding, D1 idempotency, and temporary legacy fallback. Production cutover and legacy removal remain gated.")"
echo "$PR_URL"
```

- [ ] **Step 3: Freeze exact head and wait for fresh checks**

```bash
HEAD_SHA="$(git rev-parse HEAD)"
gh pr view --repo MakerParsDev/Astroloji --json headRefOid,mergeable,state --jq '{head:.headRefOid,mergeable,state}'
gh pr checks --repo MakerParsDev/Astroloji --watch --fail-fast
```

Require Android CI, backend CI, secret scan, Semgrep, GitGuardian, and CodeRabbit success on exactly `$HEAD_SHA`. Resolve every actionable review thread; any pushed fix invalidates prior check evidence and restarts this step.
- [ ] **Step 4: Merge only the reviewed head and verify parentage**

```bash
PR_NUMBER="$(gh pr view --repo MakerParsDev/Astroloji --json number --jq .number)"
gh pr merge "$PR_NUMBER" --repo MakerParsDev/Astroloji --merge --match-head-commit "$HEAD_SHA"
git fetch origin main
MERGE_SHA="$(git rev-parse origin/main)"
PARENTS="$(git show -s --format='%P' "$MERGE_SHA")"
printf 'merge=%s\nparents=%s\n' "$MERGE_SHA" "$PARENTS"
```

Require the reviewed `$HEAD_SHA` to be the second parent of the merge commit before any production operation.

### Task 7: Phase A Production Foundation, Deploy, and Authenticated Google Delivery Proof

**Files:** production resources/configuration only; no repository edit in this task.

**Interfaces:**
- Consumes: exact merged Phase A SHA, `backend-production-deploy.yml`, Google Cloud CLI auth, Play Console RTDN configuration UI.
- Produces: migrated production D1, Phase A Worker, authenticated Pub/Sub push with bounded dead-letter behavior, and one no-op Google test delivery processed through OIDC.

- [ ] **Step 1: Reconfirm immutable safety gates**

Read back without mutation:

```bash
test "$(gh variable get ENABLE_PRODUCTION_RELEASE --repo MakerParsDev/Astroloji)" = "false"
git fetch origin main
PHASE_A_MAIN_SHA="$(git rev-parse origin/main)"
echo "phaseAMain=$PHASE_A_MAIN_SHA"
```

Also confirm no temporary release/screenshot workflow state is active. Do not alter Play rollout or subscriptions.

- [ ] **Step 2: Discover the Play Console RTDN topic state before creating anything**

In Play Console: **Monetize → Monetization setup → Real-time developer notifications**. Record only one operator state: `topic configured` or `topic blank`; do not put a production topic/project identifier in public evidence.

If the topic is configured, paste it only into the local MSI operator shell, never into chat or repository evidence:

```bash
read -r -p 'Paste current Play RTDN topic resource name: ' PLAY_RTDN_TOPIC
[[ "$PLAY_RTDN_TOPIC" =~ ^projects/[^/]+/topics/[^/]+$ ]] || { echo 'Invalid RTDN topic resource name.' >&2; exit 1; }
PUBSUB_PROJECT_ID="${PLAY_RTDN_TOPIC#projects/}"
PUBSUB_PROJECT_ID="${PUBSUB_PROJECT_ID%%/topics/*}"
gcloud pubsub topics describe "$PLAY_RTDN_TOPIC" --project "$PUBSUB_PROJECT_ID" >/dev/null
```

If the project/topic is not accessible with the authorized operator account, stop; do not redirect Play to a new topic silently.

If the topic is blank, use the project ID already present in `GOOGLE_SERVICE_ACCOUNT_JSON` without printing it, and create/reuse the deterministic topic `astrology-play-rtdn`:

```bash
PUBSUB_PROJECT_ID="$(
  doppler secrets get GOOGLE_SERVICE_ACCOUNT_JSON --plain --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" |
    node -e 'let input=""; process.stdin.on("data", (chunk) => input += chunk); process.stdin.on("end", () => process.stdout.write(JSON.parse(input).project_id));'
)"
PLAY_RTDN_TOPIC="projects/${PUBSUB_PROJECT_ID}/topics/astrology-play-rtdn"
gcloud pubsub topics describe "$PLAY_RTDN_TOPIC" >/dev/null 2>&1 || \
  gcloud pubsub topics create "$PLAY_RTDN_TOPIC"
```

- [ ] **Step 3: Grant Google Play publish permission to the RTDN topic**

```bash
gcloud pubsub topics add-iam-policy-binding "$PLAY_RTDN_TOPIC" \
  --member='serviceAccount:google-play-developer-notifications@system.gserviceaccount.com' \
  --role='roles/pubsub.publisher' >/dev/null
```

Read back only a boolean that the exact member/role binding exists; do not publish the project/topic name in repository evidence.

- [ ] **Step 4: Create/reuse a dedicated push identity**

```bash
PUSH_SA_NAME='astrology-rtdn-push'
PUSH_SA_EMAIL="${PUSH_SA_NAME}@${PUBSUB_PROJECT_ID}.iam.gserviceaccount.com"
gcloud iam service-accounts describe "$PUSH_SA_EMAIL" --project "$PUBSUB_PROJECT_ID" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$PUSH_SA_NAME" --project "$PUBSUB_PROJECT_ID" --display-name='Astrology RTDN push identity'
PROJECT_NUMBER="$(gcloud projects describe "$PUBSUB_PROJECT_ID" --format='value(projectNumber)')"
PUBSUB_AGENT="service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com"
```
Grant token creation only on the dedicated push service account:

```bash
gcloud iam service-accounts add-iam-policy-binding "$PUSH_SA_EMAIL" \
  --project "$PUBSUB_PROJECT_ID" \
  --member="serviceAccount:${PUBSUB_AGENT}" \
  --role='roles/iam.serviceAccountTokenCreator' >/dev/null
```

- [ ] **Step 5: Create/reuse bounded dead-letter resources**

Use deterministic resource IDs in the same project:

```bash
DLQ_TOPIC="projects/${PUBSUB_PROJECT_ID}/topics/astrology-play-rtdn-dead-letter"
DLQ_SUB='astrology-play-rtdn-dead-letter-audit'
gcloud pubsub topics describe "$DLQ_TOPIC" >/dev/null 2>&1 || gcloud pubsub topics create "$DLQ_TOPIC"
gcloud pubsub subscriptions describe "$DLQ_SUB" --project "$PUBSUB_PROJECT_ID" >/dev/null 2>&1 || \
  gcloud pubsub subscriptions create "$DLQ_SUB" --project "$PUBSUB_PROJECT_ID" --topic "$DLQ_TOPIC" --message-retention-duration=7d
```

Grant the Pub/Sub service agent publisher on the dead-letter topic:

```bash
gcloud pubsub topics add-iam-policy-binding "$DLQ_TOPIC" \
  --member="serviceAccount:${PUBSUB_AGENT}" \
  --role='roles/pubsub.publisher' >/dev/null
```

The push subscription itself gets `roles/pubsub.subscriber` for the same service agent after it exists.

- [ ] **Step 6: Set the exact Worker identity configuration as production environment variables**

```bash
RTDN_ENDPOINT='https://astrology.parsfilo.com/api/v1/webhooks/play-rtdn'
gh variable set PLAY_RTDN_AUDIENCE --repo MakerParsDev/Astroloji --env production --body "$RTDN_ENDPOINT"
gh variable set PLAY_RTDN_SERVICE_ACCOUNT_EMAIL --repo MakerParsDev/Astroloji --env production --body "$PUSH_SA_EMAIL"
```
Immediately read both variables back from GitHub and compare in-memory to the expected values; emit only `audienceMatch=true` and `callerMatch=true`.

- [ ] **Step 7: Capture the exact pre-Phase-A Cloudflare rollback version**

Before dispatching the deployment, load restricted Cloudflare credentials without printing them and capture the single 100%-active Worker version:

```bash
cd backend
umask 077
export CLOUDFLARE_API_TOKEN="$(doppler secrets get CLOUDFLARE_API_TOKEN --plain --project mobil-apps --config astrology)"
export CLOUDFLARE_ACCOUNT_ID="$(gh variable get CLOUDFLARE_ACCOUNT_ID --repo MakerParsDev/Astroloji)"
npx wrangler deployments list --name astrology-backend --json > /tmp/astro-play-rtdn-pre-phase-a-deployments.json
PRE_PHASE_A_VERSION="$(node - /tmp/astro-play-rtdn-pre-phase-a-deployments.json <<'NODE'
const fs=require('fs'); const rows=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const active=rows[0]?.versions ?? [];
if (active.length !== 1 || active[0]?.percentage !== 100 || !active[0]?.version_id) process.exit(2);
process.stdout.write(active[0].version_id);
NODE
)"
```

Do not print `$PRE_PHASE_A_VERSION`. This direct Worker rollback is permitted only before changing Pub/Sub or Play Console. If Phase A activates but migration/live verification fails at that pre-cutover stage:

```bash
npx wrangler rollback "$PRE_PHASE_A_VERSION" --name astrology-backend --message 'RTDN Phase A rollback' --yes
```

After rollback, verify the prior health/RTDN legacy boundary and stop. Leave the additive D1 migration in place.

- [ ] **Step 8: Deploy Phase A from exact merged main**

```bash
gh workflow run backend-production-deploy.yml --repo MakerParsDev/Astroloji --ref main -f confirm=DEPLOY
```

Resolve the newly created run by workflow + branch + exact `$PHASE_A_MAIN_SHA`, then:

```bash
gh run watch "$DEPLOY_RUN_ID" --repo MakerParsDev/Astroloji --exit-status
```

Require workflow success, migration/schema read-back success, and live endpoint verification. Independently query production D1 with `PRAGMA table_info(play_rtdn_messages)` and emit only `schemaReady=true` after matching the eight required columns.

- [ ] **Step 9: Create or safely adopt exactly one push subscription for the Play topic**

First enumerate subscriptions whose `topic` equals `$PLAY_RTDN_TOPIC`. If more than one push subscription already exists, stop for manual review; do not create a duplicate consumer.

If no push subscription exists, create deterministic `astrology-play-rtdn-push`:

```bash
PUSH_SUB='astrology-play-rtdn-push'
gcloud pubsub subscriptions create "$PUSH_SUB" \
  --project "$PUBSUB_PROJECT_ID" \
  --topic "$PLAY_RTDN_TOPIC" \
  --push-endpoint "$RTDN_ENDPOINT" \
  --push-auth-service-account "$PUSH_SA_EMAIL" \
  --push-auth-token-audience "$RTDN_ENDPOINT" \
  --dead-letter-topic "$DLQ_TOPIC" \
  --max-delivery-attempts=5 \
  --min-retry-delay=10s \
  --max-retry-delay=600s
```

If exactly one existing push subscription belongs to this Play topic, set `PUSH_SUB` to its ID and update all push/dead-letter fields in one command rather than creating a second subscription.
Existing-subscription update command:

```bash
gcloud pubsub subscriptions update "$PUSH_SUB" --project "$PUBSUB_PROJECT_ID" \
  --push-endpoint "$RTDN_ENDPOINT" \
  --push-auth-service-account "$PUSH_SA_EMAIL" \
  --push-auth-token-audience "$RTDN_ENDPOINT" \
  --dead-letter-topic "$DLQ_TOPIC" \
  --max-delivery-attempts=5 \
  --min-retry-delay=10s \
  --max-retry-delay=600s
```

Then grant the Pub/Sub service agent subscriber permission on the push subscription:

```bash
gcloud pubsub subscriptions add-iam-policy-binding "$PUSH_SUB" \
  --project "$PUBSUB_PROJECT_ID" \
  --member="serviceAccount:${PUBSUB_AGENT}" \
  --role='roles/pubsub.subscriber' >/dev/null
```

Read back and emit only booleans: `secretFreeEndpoint`, `oidcConfigured`, `audienceMatch`, `callerMatch`, `deadLetterConfigured`, `maxAttemptsIs5`, and `retryPolicyConfigured`.

- [ ] **Step 10: Enable/confirm Play Console RTDN and send the provider test message**

If the Play Console topic was blank, enter the locally held `$PLAY_RTDN_TOPIC`, enable RTDN, select **Get notifications for subscriptions and all voided purchases** (the app has no one-time product catalog in this scope), click **Send Test Message**, then **Save changes** after the test publish succeeds.

If Play Console already pointed to `$PLAY_RTDN_TOPIC`, do not change notification-type selection; only use **Send Test Message** and preserve the existing setting.

If Play Console points to a different topic than the accessible/adopted `$PLAY_RTDN_TOPIC`, stop rather than redirecting production implicitly.

- [ ] **Step 11: Prove the test notification traversed OIDC without customer mutation**

Within ten minutes of the Play test publish, query D1 for rows with `notification_type='test'`, `status='processed'`, `outcome='test'`, and recent `received_at`. Emit only `authenticatedTestProcessed=true` and count; do not output message IDs, package name, fingerprint, or caller identity.
Also independently verify no subscription/customer tables changed because the proof used `testNotification`; do not query or print customer rows.

- [ ] **Step 12: Verify Phase A fallback and keep it intact**

Dispatch:

```bash
gh workflow run backend-play-webhook-smoke.yml --repo MakerParsDev/Astroloji --ref main
```

Resolve/watch the exact-main run and require summary outcomes `unauthorized=403` and `legacy-authorized-invalid-payload=400`. This proves rollback compatibility remains available while Pub/Sub has already moved to OIDC.

Do **not** delete `PLAY_WEBHOOK_SECRET` from Cloudflare or Doppler in Phase A.

If a failure after the OIDC Pub/Sub cutover requires the pre-Phase-A Worker, reverse the dependency in this exact order. First restore the legacy Pub/Sub push config while the compatibility Worker is still active. Keep the shared secret and access token in process memory only:

```bash
export PUSH_SUB PUBSUB_PROJECT_ID RTDN_ENDPOINT DOPPLER_PROJECT DOPPLER_CONFIG
node <<'NODE'
const { execFileSync } = require('node:child_process');
(async () => {
  const secret = execFileSync('doppler', [
    'secrets', 'get', 'PLAY_WEBHOOK_SECRET', '--plain',
    '--project', process.env.DOPPLER_PROJECT, '--config', process.env.DOPPLER_CONFIG,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const accessToken = execFileSync('gcloud', ['auth', 'print-access-token'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const subscription = `projects/${process.env.PUBSUB_PROJECT_ID}/subscriptions/${process.env.PUSH_SUB}`;
  const pushEndpoint = `${process.env.RTDN_ENDPOINT}?token=${encodeURIComponent(secret)}`;
  const response = await fetch(
    `https://pubsub.googleapis.com/v1/${subscription}:modifyPushConfig`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ pushConfig: { pushEndpoint } }),
    },
  );
  if (!response.ok) throw new Error(`Pub/Sub legacy rollback failed with ${response.status}.`);
  console.log('legacyPushConfigRestored=true');
})().catch(() => process.exit(1));
NODE
```

Read the subscription back into a mode-0600 local JSON file and emit only `legacyEndpointHasQuery=true` and `oidcConfigured=false`; never print the endpoint. Then run the Phase A legacy boundary smoke and require `403/400`. Only after that proof may `$PRE_PHASE_A_VERSION` be restored with `wrangler rollback`. If any reversal/read-back fails, keep the Phase A compatibility Worker active and stop.

- [ ] **Step 13: Re-run idempotency/replay regression locally before Phase B**

From a fresh worktree at the exact Phase A `origin/main`:

```bash
cd backend
npm ci
npm test -- --run tests/services/playRtdnAuth.test.ts tests/services/playRtdnDelivery.test.ts tests/workers/subscription.test.ts
```

Require duplicate, processing-duplicate, mismatch, expired/wrong-audience caller, package mismatch, and retry-release cases all green. Do not replay a signed production RTDN callback manually.

After Phase A authenticated delivery, fallback smoke, and regression gates are all green, remove only the local rollback metadata file and clear restricted shell credentials:

```bash
rm -f /tmp/astro-play-rtdn-pre-phase-a-deployments.json
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID PRE_PHASE_A_VERSION
```

### Task 8: Phase B Remove Legacy Shared-Secret Authentication

**Files:**
- Modify: `backend/src/middleware/auth.ts`
- Modify: `backend/src/types.ts`
- Modify: `backend/scripts/shared.ts`
- Modify: `backend/tests/helpers/env.ts`
- Modify: `backend/tests/workers/subscription.test.ts`
- Modify: `backend/tests/runtime/worker-runtime.test.ts`
- Modify: `backend/tests/scripts/shared.test.ts`
- Modify: `.github/workflows/backend-production-deploy.yml`
- Modify: `.github/workflows/backend-play-webhook-smoke.yml`
- Modify: `scripts/backend-play-rtdn-workflow.test.mjs`
- Modify: `backend/README.md`
**Interfaces:**
- `requirePlayWebhookAuth()` becomes OIDC-only and produces only `{ method: 'oidc' }` or 403.
- Active Cloudflare secret sync no longer knows `PLAY_WEBHOOK_SECRET`.
- Production smoke proves missing auth, query-token auth, and header-secret auth all fail.

- [ ] **Step 1: Create a fresh Phase B worktree from verified Phase A main**

```bash
git fetch origin main
git worktree add /tmp/astro-play-rtdn-oidc-only-20260808 -b fix/play-rtdn-oidc-only-20260808 origin/main
cd /tmp/astro-play-rtdn-oidc-only-20260808
git config user.name MakerParsDev
git config user.email makerpars@gmail.com
```

Do not implement Phase B on the old Phase A worktree.

- [ ] **Step 2: Write failing legacy-rejection tests first**

Update worker/runtime tests so both of these return 403 even when the values equal the historical test secret:

```ts
'/api/v1/webhooks/play-rtdn?token=play-secret'
headers: { 'x-play-secret': 'play-secret' }
```

Keep the invalid-bearer test and valid injected OIDC tests.

Update `scripts/backend-play-rtdn-workflow.test.mjs` to require absence of `PLAY_WEBHOOK_SECRET` from active runtime/deploy/smoke config and absence of `?token=` from active RTDN documentation/workflow paths.

Run RED:

```bash
node --test scripts/backend-play-rtdn-workflow.test.mjs
cd backend
npm test -- --run tests/workers/subscription.test.ts tests/runtime/worker-runtime.test.ts tests/scripts/shared.test.ts
```
- [ ] **Step 3: Remove the legacy branch from request authentication**

`auth.ts` final behavior:

```ts
const bearer = getBearerToken(c.req.header('authorization'));
if (!bearer) return jsonError(c, 403, 'FORBIDDEN', 'Play webhook identity is invalid.');
try {
  await verifyIdentity(c.env, bearer);
  return { method: 'oidc' } as const;
} catch {
  return jsonError(c, 403, 'FORBIDDEN', 'Play webhook identity is invalid.');
}
```

Delete all query/header secret parsing for RTDN.

- [ ] **Step 4: Remove the active secret dependency**

Delete `PLAY_WEBHOOK_SECRET` from:
- `SecretBindings` in `backend/src/types.ts`;
- `CLOUDFLARE_SECRET_NAMES` in `backend/scripts/shared.ts`;
- `createTestEnv()` and runtime test vars;
- required Doppler secret list in `backend-production-deploy.yml`;
- all secret loading/masking in `backend-play-webhook-smoke.yml`.

Do not edit historical design/verification documents merely because they mention the migration history.

- [ ] **Step 5: Make the production smoke OIDC-only boundary-negative**

The smoke sends `{}` three ways and requires all to return 403 before payload validation:

```text
no Authorization header
?token=legacy-disabled
X-Play-Secret: legacy-disabled
```

The workflow summary states only that all legacy/unauthenticated paths are rejected. Positive OIDC proof remains the real Pub/Sub/Play test delivery from Task 7 and is repeated after Phase B deploy.
- [ ] **Step 6: Update README to the final OIDC-only contract**

Remove query-token/header-secret setup instructions. Document only:
- secret-free RTDN endpoint;
- authenticated Pub/Sub push with expected service identity/audience;
- strict package binding and message-id dedupe;
- test notification no-op;
- authoritative Play API lookup for subscription notifications;
- bounded dead-letter policy and operator read-back.

- [ ] **Step 7: Run focused tests, active-reference scan, and full gates**

```bash
node --test scripts/backend-play-rtdn-workflow.test.mjs
node --test scripts/*.test.mjs
node scripts/scan-secrets.mjs
! grep -RIn 'PLAY_WEBHOOK_SECRET' backend/src backend/scripts/shared.ts backend/tests/helpers .github/workflows/backend-production-deploy.yml .github/workflows/backend-play-webhook-smoke.yml backend/README.md
cd backend
npm ci
npm run build
npm test
npm run test:runtime
npm run build:transition
npm run test:runtime:transition
npm audit --audit-level=high
cd ..
git diff --check origin/main...HEAD
```

Expected: all PASS and active-reference grep exits 0 because no match exists.

- [ ] **Step 8: Commit Phase B code**

```bash
git add backend/src/middleware/auth.ts backend/src/types.ts backend/scripts/shared.ts backend/tests/helpers/env.ts backend/tests/workers/subscription.test.ts backend/tests/runtime/worker-runtime.test.ts backend/tests/scripts/shared.test.ts .github/workflows/backend-production-deploy.yml .github/workflows/backend-play-webhook-smoke.yml scripts/backend-play-rtdn-workflow.test.mjs backend/README.md
git commit -m "fix(backend): require OIDC for Play RTDN"
```

### Task 9: Phase B Same-Repository PR, Exact-Head Review, and Merge

**Files:** no new implementation files; delivery gate for Task 8.

- [ ] **Step 1: Push Phase B branch and open PR**

```bash
git push -u origin HEAD
PHASE_B_PR_URL="$(gh pr create --repo MakerParsDev/Astroloji --base main --head "$(git branch --show-current)" --title "fix: require OIDC for Play RTDN" --body "Phase B for #6: removes query/header shared-secret RTDN authentication after authenticated production delivery was proven in Phase A.")"
echo "$PHASE_B_PR_URL"
```

- [ ] **Step 2: Freeze exact head and require fresh review/checks**

```bash
PHASE_B_HEAD="$(git rev-parse HEAD)"
gh pr checks --repo MakerParsDev/Astroloji --watch --fail-fast
```

Require Android CI, backend CI, secret scan, Semgrep, GitGuardian, and CodeRabbit success on exactly `$PHASE_B_HEAD`. Resolve every actionable review; any new commit restarts the gate.

- [ ] **Step 3: Merge only exact reviewed Phase B head**

```bash
PHASE_B_PR="$(gh pr view --repo MakerParsDev/Astroloji --json number --jq .number)"
gh pr merge "$PHASE_B_PR" --repo MakerParsDev/Astroloji --merge --match-head-commit "$PHASE_B_HEAD"
git fetch origin main
PHASE_B_MAIN_SHA="$(git rev-parse origin/main)"
PARENTS="$(git show -s --format='%P' "$PHASE_B_MAIN_SHA")"
printf 'phaseBMain=%s\nparents=%s\n' "$PHASE_B_MAIN_SHA" "$PARENTS"
```

Require `$PHASE_B_HEAD` as the merge commit's second parent.

### Task 10: Phase B Production Deploy, Legacy Rejection, and Secret Retirement

**Files:** production state only; no repository edit until evidence Task 11.

**Interfaces:**
- Consumes: exact merged Phase B main, already-authenticated Pub/Sub configuration from Task 7.
- Produces: OIDC-only production route, successful post-cutover Google test delivery, legacy paths rejected, obsolete secret absent from Cloudflare and Doppler.

- [ ] **Step 1: Reconfirm Phase B deploy preconditions**

Require all of these before dispatch:

```text
ENABLE_PRODUCTION_RELEASE=false
Pub/Sub push endpoint is secret-free
OIDC service account configured
OIDC audience matches RTDN endpoint
dead-letter max attempts = 5
Phase A authenticated test evidence = true
PLAY_WEBHOOK_SECRET still exists before deploy for rollback safety
```

If any precondition is false, stop. Do not delete the legacy secret early.

- [ ] **Step 2: Capture the exact active Phase A Cloudflare version**

Before Phase B deploy, obtain the single 100%-active Worker version without printing it:

```bash
cd backend
umask 077
export CLOUDFLARE_API_TOKEN="$(doppler secrets get CLOUDFLARE_API_TOKEN --plain --project mobil-apps --config astrology)"
export CLOUDFLARE_ACCOUNT_ID="$(gh variable get CLOUDFLARE_ACCOUNT_ID --repo MakerParsDev/Astroloji)"
npx wrangler deployments list --name astrology-backend --json > /tmp/astro-play-rtdn-pre-phase-b-deployments.json
PRE_PHASE_B_VERSION="$(node - /tmp/astro-play-rtdn-pre-phase-b-deployments.json <<'NODE'
const fs=require('fs'); const rows=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const active=rows[0]?.versions ?? [];
if (active.length !== 1 || active[0]?.percentage !== 100 || !active[0]?.version_id) process.exit(2);
process.stdout.write(active[0].version_id);
NODE
)"
```

Do not print `$PRE_PHASE_B_VERSION`. If rollback is required before secret retirement:

```bash
npx wrangler rollback "$PRE_PHASE_B_VERSION" --name astrology-backend --message 'RTDN Phase B rollback' --yes
```

After rollback, re-run the Phase A compatibility boundary smoke and stop.

- [ ] **Step 3: Deploy exact Phase B main**

```bash
gh workflow run backend-production-deploy.yml --repo MakerParsDev/Astroloji --ref main -f confirm=DEPLOY
```

Resolve the run by workflow + `main` + exact `$PHASE_B_MAIN_SHA`, then watch with `--exit-status`. If deployment fails, keep the legacy secret and Pub/Sub config unchanged; if the new version activated, use the captured Phase A version to roll back before further action.

- [ ] **Step 4: Run final negative boundary smoke**

```bash
gh workflow run backend-play-webhook-smoke.yml --repo MakerParsDev/Astroloji --ref main
```

Require exact Phase B main and workflow success proving all three unauthenticated/legacy paths return 403.

- [ ] **Step 5: Send a second Play Console test notification on Phase B**

Use **Send Test Message** in the already-configured Play Console RTDN section. Do not change the topic or notification-type selection.

Query D1 for a new recent `notification_type='test' AND status='processed' AND outcome='test'` row whose `received_at` is after the Phase B deployment completed. Emit only `phaseBOidcTestProcessed=true`.

If the test fails, **do not delete any secret**. Roll back the Worker to `$PRE_PHASE_B_VERSION` and investigate while the existing Pub/Sub OIDC config remains in place.

- [ ] **Step 6: Delete the obsolete Cloudflare Worker secret only after positive Phase B proof**

Load Cloudflare credentials in-memory from existing restricted sources and first assert `PLAY_WEBHOOK_SECRET` is present by **name only**:

```bash
cd backend
export CLOUDFLARE_API_TOKEN="$(doppler secrets get CLOUDFLARE_API_TOKEN --plain --project mobil-apps --config astrology)"
export CLOUDFLARE_ACCOUNT_ID="$(gh variable get CLOUDFLARE_ACCOUNT_ID --repo MakerParsDev/Astroloji)"
npx wrangler secret list --name astrology-backend --format json > /tmp/astro-worker-secrets.json
node - /tmp/astro-worker-secrets.json <<'NODE'
const fs=require('fs'); const rows=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if (!rows.some((row) => row.name === 'PLAY_WEBHOOK_SECRET')) process.exit(2);
console.log('legacyWorkerSecretPresent=true');
NODE
```

Delete and independently read back absence:

```bash
npx wrangler secret delete PLAY_WEBHOOK_SECRET --name astrology-backend
npx wrangler secret list --name astrology-backend --format json > /tmp/astro-worker-secrets-after.json
node - /tmp/astro-worker-secrets-after.json <<'NODE'
const fs=require('fs'); const rows=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if (rows.some((row) => row.name === 'PLAY_WEBHOOK_SECRET')) process.exit(2);
console.log('legacyWorkerSecretAbsent=true');
NODE
```

Never print any secret values.

- [ ] **Step 7: Delete the obsolete Doppler secret and verify absence**

```bash
doppler secrets delete PLAY_WEBHOOK_SECRET --project mobil-apps --config astrology --yes
if doppler secrets get PLAY_WEBHOOK_SECRET --plain --project mobil-apps --config astrology >/dev/null 2>&1; then
  echo 'Legacy Doppler secret still exists.' >&2; exit 1
fi
echo 'legacyDopplerSecretAbsent=true'
```
- [ ] **Step 8: Final independent production read-back**

Require all booleans/statuses:

```text
origin/main = exact Phase B merge
ENABLE_PRODUCTION_RELEASE = false
public RTDN with no bearer = 403
public RTDN with dummy ?token= = 403
public RTDN with dummy X-Play-Secret = 403
Pub/Sub endpoint secret-free = true
Pub/Sub OIDC configured = true
audience match = true
caller match = true
dead-letter configured = true
max delivery attempts = 5
recent Phase B Google test notification processed = true
Cloudflare PLAY_WEBHOOK_SECRET absent = true
Doppler PLAY_WEBHOOK_SECRET absent = true
```

Remove local temporary JSON files containing deployment metadata or secret names:

```bash
rm -f /tmp/astro-worker-secrets.json /tmp/astro-worker-secrets-after.json /tmp/astro-play-rtdn-pre-phase-b-deployments.json
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID PUSH_SA_EMAIL PUBSUB_AGENT PRE_PHASE_B_VERSION
```

Do not delete the D1 idempotency table, RTDN topic/subscription, dead-letter resources, or OIDC service account; they are permanent production infrastructure.

### Task 11: Sanitized Verification Evidence, Final PR, and Issue Closure

**Files:**
- Create: `docs/verification/play-rtdn-authentication-replay-hardening-2026-08-08.md`

**Interfaces:**
- Consumes: exact Phase A/Phase B PR SHAs and run IDs plus allowlisted booleans/statuses from Tasks 7 and 10.
- Produces: reviewable public proof sufficient to close #6 without production identifiers or sensitive payloads.

- [ ] **Step 1: Create a fresh evidence worktree from final `origin/main`**

```bash
git fetch origin main
git worktree add /tmp/astro-play-rtdn-evidence-20260808 -b docs/play-rtdn-verification-20260808 origin/main
cd /tmp/astro-play-rtdn-evidence-20260808
git config user.name MakerParsDev
git config user.email makerpars@gmail.com
```
- [ ] **Step 2: Write allowlisted production evidence only**

Document:
- Phase A reviewed head/merge SHA and fresh CI/CodeRabbit success;
- D1 migration/schema read-back success;
- Pub/Sub config booleans only: secret-free endpoint, OIDC configured, audience/caller match, dead-letter configured, max attempts 5;
- Play Console `Send Test Message` succeeded and a recent no-op test row reached `processed` through OIDC;
- idempotency/replay/package mismatch tests passed;
- Phase B reviewed head/merge SHA and fresh CI/CodeRabbit success;
- final missing/query/header legacy paths all rejected;
- second post-Phase-B Google test delivery processed;
- Cloudflare and Doppler legacy secret **name** absent;
- `ENABLE_PRODUCTION_RELEASE=false` remained unchanged;
- no customer entitlement, rollout, product, price, purchase, refund, or restore state was manually changed.

Do **not** include service-account email, project ID, topic/subscription name, full message ID, fingerprint, bearer token, shared-secret value, purchase token, raw payload, or Cloudflare version ID.

- [ ] **Step 3: Map every #6 acceptance criterion explicitly**

Use these headings/claims:

```text
Valid signed service identity required
Issuer/audience/expiry/caller/email_verified validated
URL/header shared-secret auth removed
Duplicate delivery state transition suppressed
Package identity server-bound and mismatch rejected
Unit/runtime valid/invalid/expired/duplicate/mismatch/retry coverage
Logs/evidence contain correlation classes but no sensitive payloads
```

State any limitation exactly; do not infer completion from a missing tool/read-back.

- [ ] **Step 4: Run evidence leakage and repository contract gates**

```bash
DOC=docs/verification/play-rtdn-authentication-replay-hardening-2026-08-08.md
! grep -E 'projects/[^ ]+/topics/|iam\.gserviceaccount\.com|Authorization: Bearer|purchase[_ -]?token[=:][^ ]+' "$DOC"
node scripts/scan-secrets.mjs
node --test scripts/*.test.mjs
git diff --check
git status --short
```
Expected: no forbidden identifier pattern, secret scan PASS, repository contract suite PASS, only the evidence document uncommitted.

- [ ] **Step 5: Commit and open same-repository evidence PR**

```bash
git add docs/verification/play-rtdn-authentication-replay-hardening-2026-08-08.md
git commit -m "docs: record Play RTDN production verification"
EVIDENCE_HEAD="$(git rev-parse HEAD)"
git push -u origin HEAD
gh pr create --repo MakerParsDev/Astroloji --base main --head "$(git branch --show-current)" --title "docs: verify Play RTDN production controls" --body "Records sanitized production verification for #6. No production caller identifier, token, purchase data, rollout, or subscription mutation is included."
```

- [ ] **Step 6: Require fresh exact-head CI and CodeRabbit**

```bash
gh pr checks --repo MakerParsDev/Astroloji --watch --fail-fast
```

Require all normal repository checks on exactly `$EVIDENCE_HEAD`. Confirm no actionable review thread. Any evidence edit invalidates prior checks.

- [ ] **Step 7: Merge exact evidence head and verify parentage**

```bash
EVIDENCE_PR="$(gh pr view --repo MakerParsDev/Astroloji --json number --jq .number)"
gh pr merge "$EVIDENCE_PR" --repo MakerParsDev/Astroloji --merge --match-head-commit "$EVIDENCE_HEAD"
git fetch origin main
EVIDENCE_MERGE="$(git rev-parse origin/main)"
git show -s --format='%P' "$EVIDENCE_MERGE"
```

Require `$EVIDENCE_HEAD` as the second parent.

- [ ] **Step 8: Close #6 with a sanitized completion comment**

Only after the final evidence merge and one last production read-back remains green:

```bash
gh issue close 6 --repo MakerParsDev/Astroloji --reason completed --comment "Completed after two-phase authenticated Pub/Sub rollout, D1 message idempotency, package binding, OIDC-only cutover, bounded retry/dead-letter configuration, final legacy-secret retirement, fresh CI/review, and sanitized production evidence in docs/verification/play-rtdn-authentication-replay-hardening-2026-08-08.md."
```
- [ ] **Step 9: Independently verify issue and milestone state**

Read back #6 and #1 through GitHub. Require:

```text
#6 state = closed
#6 state_reason = completed
#1 Phase 2 checkbox for #6 = [x]
```

Do not manually change unrelated #7–#19 milestone checkboxes.

## Execution Checkpoints

Stop and report instead of guessing when any of these gates fails:
- Play Console RTDN topic is configured to a different/inaccessible GCP project;
- more than one existing push subscription consumes the configured Play topic;
- operator lacks `iam.serviceAccounts.actAs`, Pub/Sub, or required service-account IAM permission;
- Phase A authenticated Play test delivery is not observed;
- dead-letter policy cannot be verified as bounded before Phase B;
- any exact-head CI/CodeRabbit/security check fails;
- Phase B positive OIDC test fails;
- Cloudflare/Doppler secret deletion cannot be independently read back.

Rollback rules:
- Before the Phase A Pub/Sub cutover, the captured `$PRE_PHASE_A_VERSION` may be restored directly if Worker deployment/live verification fails; Pub/Sub and Play are still unchanged at that point.
- After Pub/Sub has been switched to OIDC, **never roll the Worker back first**. Restore the prior legacy Pub/Sub push configuration first, verify the legacy boundary against the still-running Phase A compatibility Worker, and only then run `npx wrangler rollback "$PRE_PHASE_A_VERSION" --name astrology-backend --message 'RTDN Phase A rollback' --yes` if Worker rollback is still required.
- Before Phase B deploy, capture the active Phase A Worker version; if Phase B fails before secret retirement, roll back to that exact Phase A version and retain the legacy secret.
- The additive `play_rtdn_messages` migration is never dropped during rollback.
- After final legacy-secret deletion, OIDC infrastructure remains the normal recovery path; recreating a shared secret is not part of routine rollback and requires a new explicit security decision.

## Completion Definition

The work is complete only when both code phases and the evidence PR are merged with exact-head review, production D1 schema is read back, a real Play/Pub/Sub test notification has succeeded on both compatibility and OIDC-only Worker versions, final legacy query/header probes are rejected, dead-letter behavior is bounded, `PLAY_WEBHOOK_SECRET` is absent from active code/Cloudflare/Doppler, production release/subscription state is untouched, and GitHub issue #6 is independently confirmed closed.
