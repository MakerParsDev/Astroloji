# Atomic Rate Limiting and Admin Least-Privilege Design

**Issue:** #7 — Replace non-atomic rate limiting and scope administrative access

## Goal

Close the two production security gaps tracked by #7 without changing product behavior unrelated to abuse resistance:

1. Replace KV read-modify-write rate counters with deterministic atomic enforcement under concurrency.
2. Replace the single broad `ADMIN_SECRET` boundary with capability-scoped credentials, independent rotation/revocation, and sanitized privileged-operation audit events.

The implementation must preserve existing route limits, existing customer entitlement semantics, existing Play RTDN/SSV security, and `ENABLE_PRODUCTION_RELEASE=false` unless a separately approved release task changes it.

## Current state and confirmed gaps

The backend currently implements `enforceRateLimit()` with KV `get -> increment -> put`. Concurrent requests can read the same counter and overwrite one another, allowing more requests than the configured limit.

The current `ADMIN_SECRET` protects all administrative capabilities: content backfill/cache bypass, notification sending, Play subscription read/write operations, subscription reconciliation audit, and Play review read/reply operations. Compromise of that one credential therefore exposes every administrative capability.

The repository already has a request correlation ID and sanitized RTDN logging patterns that can be reused for privileged audit events.
## Architecture: strict rate limiting

A SQLite-backed Durable Object class named `RateLimitBucket` will be the source of truth for protected-route counters. The Worker receives a Durable Object namespace binding and resolves one object per deterministic bucket key.

The object key is derived server-side from route class plus principal. No request may provide an arbitrary bucket name. Separate principals and route classes map to separate objects so unrelated users do not serialize behind a global coordinator.

Protected buckets remain behaviorally equivalent to the currently reviewed production configuration:

- registration uses the client IP principal;
- content uses authenticated user plus content class;
- chart uses authenticated user;
- subscription verification uses authenticated user;
- rewarded prepare uses authenticated user.

The issue does not publish or retune production thresholds. It changes enforcement semantics from best-effort KV counting to strict atomic counting while preserving the reviewed configured values.

The object stores only the current fixed-window start and count. Persistent Durable Object storage, not in-memory state, is authoritative so eviction or Worker restart cannot silently reset an active window.
### Rate-limit request contract

The Worker-to-object call contains only server-derived bucket identity plus configured `limit` and `windowSeconds`. The object returns:

```text
{ allowed, remaining, retryAfterSeconds }
```

For the same object/window, decisions are serialized. Once `count >= limit`, later requests are rejected without incrementing customer/business state.

A rejected request returns `429 RATE_LIMITED`. A non-sensitive `Retry-After` header may be returned, but the response must not expose principal IDs, internal object IDs, bucket keys, counters, or storage details.

If the Durable Object cannot return a decision, the protected route fails closed with `503 RATE_LIMIT_UNAVAILABLE`; it must not continue without rate limiting. This availability failure is distinct from a normal quota rejection.

`/users/register` keeps the existing IP principal. Firebase verification stays after the registration abuse boundary so an unauthenticated caller cannot force unlimited expensive identity verification. Authenticated routes continue to use the verified application user ID.

## Rate-limit verification

The concurrency contract is exact, not approximate. For a configured limit `N`, `M > N` concurrent requests against one principal and one route class must produce exactly `N` allowed decisions and `M-N` rejections.
Required automated cases include:

- for a synthetic fixture with limit `N` and `M > N` concurrent attempts, exactly `N` are allowed and `M-N` are rejected;
- limit 1 with two simultaneous attempts produces exactly one allow;
- different route classes for the same principal do not share quota;
- different principals do not share quota;
- a new fixed window restores the full configured quota;
- persisted state survives object recreation or eviction simulation;
- object failure returns `503` and business side effects remain zero;
- `429` paths execute no downstream business mutation.

Public evidence records aggregate allow/reject results only. It must not publish production principal IDs, IPs, Durable Object IDs, bucket keys, or defensive production identifiers.
## Architecture: administrative capabilities

The single administrative authority is replaced by four independent capabilities. Each capability has its own Worker credential binding:

- `content-ops` uses `ADMIN_CONTENT_SECRET` for content backfill and authenticated content cache bypass.
- `notification-ops` uses `ADMIN_NOTIFICATION_SECRET` for notification send.
- `play-read` uses `ADMIN_PLAY_READ_SECRET` for Play subscription listing and Play review listing.
- `play-write` uses `ADMIN_PLAY_WRITE_SECRET` for Play subscription mutation and Play review reply.

`play-write` does not imply `play-read`; the capabilities remain independent.
### Route privilege matrix

The server selects the required capability from the route; the request cannot choose or escalate its role.

- `content-ops`: `POST /admin/content/backfill` and an explicit content cache-bypass request.
- `notification-ops`: `POST /notifications/send`.
- `play-read`: `GET /admin/play/subscriptions` and `GET /admin/play/reviews`.
- `play-write`: `PATCH /admin/play/subscriptions/:productId`, `GET /admin/subscriptions/audit`, and `POST /admin/play/reviews/:reviewId/reply`.

`GET /admin/subscriptions/audit` is intentionally classified as write-capable despite its method/name because the current handler can reconcile subscription and user premium state.

All scoped credentials continue to use the single `X-Admin-Secret` request header. There is no client-supplied capability header or role claim. The route middleware already knows which credential binding is valid.

When `x-cache-bypass=true` is requested, valid `content-ops` authorization is required. Missing or invalid authorization rejects the privileged bypass request instead of silently granting bypass.
### Compatibility and legacy retirement

Phase A keeps `ADMIN_SECRET` only as a temporary compatibility credential. For a privileged route, the middleware compares the opaque header value against that route's scoped credential first and, during compatibility only, against the legacy credential.

Because the same header is used for both generations, there is no request-controlled "new" versus "legacy" mode. An invalid value simply matches neither credential and is rejected. A credential valid for one scoped capability must still receive `403` on every other capability.

Phase B removes the legacy comparison entirely. After final production verification, `ADMIN_SECRET` is removed from Worker configuration, legacy rotation/sync workflows, Doppler, Cloudflare, tests, and documentation. Independent read-back must prove the old name is absent from active secret inventories.

### Credential storage and rotation

The four scoped credentials are not placed in a broad shared Doppler config. Each capability uses a capability-specific protected GitHub production environment and the matching Cloudflare Worker secret.

The generic backend deploy workflow must not receive the four admin credential values. Capability-specific rotation/sync workflows access only their own GitHub environment secret and the Cloudflare deployment credential needed to update that one Worker binding.

Rotation changes configuration only; source changes are not required. A rotation must verify the new credential at a non-destructive auth boundary before old operator-local material is deleted.
## Privileged audit events

A single helper emits structured `admin_operation` events. The server supplies every audit classification; request bodies cannot choose the recorded capability or operation.

Allowlisted fields are:

- `requestId`;
- `capability`;
- `operation`;
- `outcome`;
- optional `dryRun` when the route already has a safe dry-run mode.

Operation values are fixed route identifiers such as `content.backfill`, `notification.send`, `play.subscription_list`, `play.subscription_update`, `play.subscription_audit`, `play.review_list`, `play.review_reply`, and `content.cache_bypass`.

Outcome is restricted to `authorized`, `rejected`, `completed`, or `failed`.

Logs must never include credential values or fingerprints, request bodies, notification text, review reply text, purchase tokens, package overrides, user identifiers, Durable Object bucket keys, or raw external API responses.
## Privilege verification

Production verification is non-destructive. For each capability, the correct credential must cross its auth boundary while every other scoped credential and no credential receive `403`.

The resulting 4x4 matrix is evaluated by capability rather than by secret value. Safe malformed requests or existing dry-run modes are used so verification does not send notifications, change subscription products, reply to reviews, or rewrite content.

Read-only Play endpoints may be used only where their response can be kept restricted and sanitized. Public evidence records capability/outcome booleans, not product/review data or production identifiers.

At least one allowed and one rejected privileged operation must be observed in production telemetry with only the allowlisted `admin_operation` fields.

## Durable Object lifecycle configuration

`RateLimitBucket` is exported from the Worker and bound through a dedicated Durable Object namespace. The new namespace uses SQLite storage and declarative class lifecycle configuration.

Conceptually the Wrangler configuration adds:

```toml
[[durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimitBucket"

[exports.RateLimitBucket]
type = "durable-object"
storage = "sqlite"
```

No KV-backed Durable Object namespace is introduced.
## Production rollout

### Phase 0 — Durable Object rollback floor

A dedicated reviewed PR introduces only the Durable Object class export/binding and inert object implementation required to provision the namespace. Existing KV rate limiting and existing admin authentication remain active.

After exact-head CI/review/merge, production deploy must verify normal public/backend behavior and the Durable Object binding without routing customer requests through it.

That deployment becomes the new rollback floor. Production rollback must not target a Worker version from before the Durable Object class lifecycle change.

### Phase A — Capability compatibility

Before Phase A code serves traffic, the four scoped credentials are pre-provisioned in their protected GitHub environments and as Cloudflare Worker secrets; Phase 0 code ignores them.

A second reviewed change adds capability middleware, audit logging, capability-specific rotation workflows, and the strict Durable Object limiter implementation, but production customer routes still use the existing KV limiter.

The legacy admin credential remains an explicit compatibility fallback during this phase. The complete scoped privilege matrix is then proven with non-destructive production checks.

Phase A must also prove credential rotation for at least one capability without source changes and verify that unrelated capabilities remain valid.
### Phase B — Strict enforcement and legacy retirement

A third reviewed change switches every protected route from KV counters to `RateLimitBucket` and removes the legacy admin fallback from runtime code.

Production verification must demonstrate strict concurrent enforcement using a synthetic, non-customer principal and a state-safe verification path. The restricted evidence records only aggregate allowed/rejected counts and whether they exactly matched the configured contract.

The scoped privilege matrix is repeated after enforcement. The legacy credential must receive `403` on privileged routes.

Only after those checks pass is `ADMIN_SECRET` deleted from Cloudflare, Doppler, legacy GitHub configuration/workflows, and operator documentation. Independent name-based read-back must prove retirement.

The Durable Object namespace remains provisioned after #7. It is permanent backend infrastructure and is not deleted as cleanup.

## Rollback

Phase 0 deliberately establishes a lifecycle-safe rollback floor because Worker rollback does not undo connected storage state and Cloudflare prevents rollback across Durable Object class lifecycle changes.

Phase A can roll back only to the verified Phase 0 version. Phase B can roll back to the verified Phase A compatibility version. Neither rollback crosses the Durable Object provisioning boundary.

During a Phase B rollback, the four scoped credentials remain provisioned and are sufficient for Phase A authorization. If legacy retirement already occurred, rollback does not recreate or depend on the retired credential. Durable Object state is left intact rather than destructively reset.
## Production verification safeguards

Strict limiter production smoke uses an existing state-safe boundary rather than a customer account. Concurrent requests intentionally fail later authentication or validation, so successful limiter admission cannot create or mutate customer state.

The production check derives the expected configured limit from reviewed code/config internally and publishes only whether aggregate enforcement matched exactly. It does not publish the principal, source IP, object identity, bucket key, or defensive threshold.

Privilege verification never sends a real notification, changes a Play subscription, replies to a review, or triggers a content rewrite. Authorized paths use malformed or dry-run inputs where available; read-only Play calls keep response bodies restricted and out of evidence.

`ENABLE_PRODUCTION_RELEASE` remains false throughout this work. No Android rollout, subscription product/pricing change, customer purchase mutation, rewarded entitlement mutation, or Play RTDN reconfiguration is part of #7.

## Credential revocation

Emergency revocation is capability-specific. Removing one scoped Worker credential must cause only that capability to reject authorization while the other three remain valid.

Because scoped credentials are not sourced from the broad Doppler config or generic deploy workflow, a later normal backend deploy cannot silently reintroduce a revoked credential. Restoration requires the explicit capability rotation/sync path and its boundary verification.
## Acceptance mapping

- **Concurrent requests cannot bypass the configured limit:** one Durable Object coordination atom owns each route-class/principal bucket and storage-backed decisions are serialized.
- **Rate-limit behavior is deterministic and covered by concurrency tests:** exact allow/reject counts are asserted under simultaneous load, with window reset and failure-path coverage.
- **Administrative access follows least privilege:** content, notification, Play read, and Play write capabilities have independent credentials and server-selected route policies.
- **One compromised credential does not grant every capability:** the 4x4 matrix requires cross-capability requests to return `403`.
- **Credentials can rotate without source changes:** capability-specific protected configuration and sync workflows update one Worker secret independently.
- **Privileged actions produce sanitized, correlatable audit records:** `admin_operation` events contain request correlation plus allowlisted capability/operation/outcome fields only.
- **Public documentation contains no operational secrets or values:** evidence contains no credential values, production principals, bucket identities, request bodies, customer identifiers, or raw provider data.

## Out of scope

- changing existing product rate-limit policy values or introducing adaptive risk scoring;
- adding a general operator portal or new human identity provider;
- redesigning Google Play service-account permissions beyond the admin HTTP boundary tracked here;
- changing RTDN OIDC authentication or rewarded SSV verification;
- modifying Android client behavior;
- changing subscription products, prices, rollout state, or customer entitlement data;
- unrelated #8–#19 reliability or quality work.

## Definition of done

#7 is complete only after Phase 0, Phase A, and Phase B are each reviewed and merged from exact-head CI; production read-back proves strict limiter enforcement, least-privilege capability isolation, credential rotation/revocation behavior, sanitized audit events, and legacy `ADMIN_SECRET` retirement; a sanitized evidence PR is merged; and issue #7 is closed with independent state read-back.
## Storage boundary after migration

The existing `CACHE` KV namespace remains in service for content caching. Phase B removes only rate-limit counter reads/writes from KV; #7 does not replace or migrate the content cache itself.