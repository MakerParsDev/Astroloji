# Google Play RTDN Authentication and Replay Hardening Design

## Scope

Issue #6 hardens only the Google Play Real-time Developer Notification ingestion path in `MakerParsDev/Astroloji`.

In scope:
- replace secret-based RTDN authentication with Google-signed Pub/Sub push identity;
- validate issuer, audience, expiry, expected caller identity, and verified email claim;
- remove secrets from webhook URLs and headers after a compatibility rollout;
- bind processing to the server-configured Play package;
- add message-level idempotency and replay protection in D1;
- define retry-safe failure handling and sanitized audit evidence;
- perform a two-phase production rollout with rollback capability.

Out of scope:
- rate-limit/admin hardening (#7);
- notification lifecycle work (#8);
- offline analytics (#9);
- App Links (#10);
- unrelated billing/product/catalog changes;
- Play production rollout, subscription pricing, or entitlement mutations outside normal RTDN reconciliation.

## Current state and problem

The current `/api/v1/webhooks/play-rtdn` route accepts either a `?token=` query secret or `X-Play-Secret`. The production smoke workflow verifies only that shared-secret boundary. The route has no signed Pub/Sub service-identity verification and no message-level dedupe table.
The existing subscription worker already makes an authoritative Google Play lookup using server-side `PACKAGE_NAME`; this is retained. The hardening project changes who may trigger the route and how duplicate deliveries are claimed, not the subscription entitlement model itself.

## Authentication architecture

The webhook URL remains:

`POST /api/v1/webhooks/play-rtdn`

Authenticated Pub/Sub push sends an OIDC JWT in the `Authorization: Bearer` header. The backend verifies the token before parsing or processing the RTDN body.

Verification requirements:
- cryptographic signature using Google's published verification keys;
- accepted Google issuer;
- exact configured audience;
- token expiration and standard time validity;
- exact configured push service-account email;
- `email_verified` must be true;
- no request field may select or override the expected audience or caller identity.

The configured audience and expected service-account identity are server-side configuration, not secrets. Production identifiers are not committed to public verification evidence.

Authentication failures are fail-closed and do not parse the RTDN payload, query Play, or mutate D1.

## Two-phase authentication rollout

### Phase A — compatibility

Deploy OIDC verification while temporarily retaining the existing shared-secret paths. During this phase:
- valid Google-signed OIDC push is accepted;
- legacy query/header auth remains available only as a migration fallback;
- authentication outcome is observable only as a bounded class such as `oidc`, `legacy`, or `rejected`;
- no bearer token, shared secret, or production caller identifier is logged.

After the compatibility deploy, update the Pub/Sub push subscription to the secret-free webhook URL and enable authenticated push with the intended service account and audience. A real authenticated Google delivery must be observed through sanitized production evidence before legacy auth is removed.

### Phase B — legacy removal

After authenticated delivery is proven:
- remove query-token and `X-Play-Secret` acceptance;
- remove `PLAY_WEBHOOK_SECRET` from backend env types and secret synchronization/deploy inventories;
- update production smoke tests and README to require OIDC only;
- remove the obsolete Cloudflare/Doppler secret after the OIDC-only deploy is independently verified.

Final production behavior accepts only the expected Google-signed service identity.

## Pub/Sub envelope and package validation

The route requires a Pub/Sub push envelope with:
- `message.messageId` as a non-empty string;
- `message.data` as a base64-encoded RTDN payload.

After OIDC authentication, the data is decoded and validated as a Google Play developer notification. Its top-level `packageName` is required and must exactly equal server-configured `env.PACKAGE_NAME`.

The request cannot select a package through query parameters, headers, or body overrides. A package mismatch is rejected before any Google Play API lookup or entitlement mutation.

Subscription notification fields are then extracted from the validated developer notification. The purchase token is used only to locate the existing owner and obtain the authoritative subscription snapshot from the Google Play Developer API. The RTDN payload itself is never treated as authoritative entitlement state.

Unsupported or malformed notification forms fail closed without state mutation.

## Idempotency storage

Add an additive D1 table dedicated to RTDN delivery claims, conceptually:

- `message_id TEXT PRIMARY KEY`
- `package_name TEXT NOT NULL`
- `message_fingerprint TEXT NOT NULL`
- `notification_type TEXT`
- `status TEXT NOT NULL`
- `lease_token TEXT NOT NULL`
- `lease_expires_at TEXT NOT NULL`
- `received_at TEXT NOT NULL`
- `processed_at TEXT`
- `outcome TEXT`

The table must not store purchase tokens, bearer tokens, raw RTDN data, or other full sensitive payload values.
`message_fingerprint` is a one-way SHA-256 digest over the canonical package name plus decoded developer-notification bytes. It exists only to detect an impossible/mismatched reuse of the same Pub/Sub message ID without persisting the payload itself.

The initial migration is additive. Existing subscription tables are not rewritten or dropped.

## Atomic processing model

For each authenticated, structurally valid delivery:

1. Compute the canonical message fingerprint.
2. Atomically attempt to insert the `message_id` claim with status `processing`, a random lease token, and a 60-second lease expiry.
3. If the insert wins, continue with the authoritative Play lookup and existing subscription processing.
4. Every customer-state D1 statement and finalization statement is fenced by the same message ID, fingerprint, lease token, processing status, and unexpired lease.
5. Mark the claim `processed` only after all intended state writes complete successfully under that lease.
6. If downstream processing fails while the worker still owns the lease, release only that exact lease before returning a retryable non-2xx response.

If the same `message_id` already exists:
- same fingerprint + `processed` => return an idempotent success without repeating the state transition;
- same fingerprint + `processing` with an unexpired lease => return retryable failure without acknowledging completion;
- same fingerprint + `processing` with an expired lease => atomically replace the lease token/expiry and retry under the new owner;
- different fingerprint or package => treat as a security/integrity mismatch and perform no state transition.

The lease token is a fencing token: after takeover, the old worker cannot release, finalize, or apply subscription/user/event writes. A zero-row finalizer is treated as a retryable consistency alarm rather than being mistaken for a transactional rollback.

The implementation must use D1 primitives that make the claim race-safe. A read-then-insert sequence without a uniqueness-enforced atomic claim is not acceptable.

## Failure, retry, and audit behavior

Failure classes are explicit:
- authentication failures: reject before body processing;
- permanently malformed or package-mismatched notifications: reject without Play/D1 entitlement mutation;
- transient Play API, D1, or internal failures: return non-2xx and leave the message retryable;
- completed duplicate: return idempotent 2xx;
- concurrent/in-progress duplicate: return retryable non-2xx rather than falsely acknowledging completion.

The rollout must verify the configured Pub/Sub retry/dead-letter behavior is compatible with permanent rejection so malformed authenticated messages cannot create an unbounded operational retry loop. If the current subscription configuration does not provide a safe bounded path, the implementation plan must add a guarded Pub/Sub configuration step before OIDC-only cutover.

Audit logging is deliberately sparse. Allowed fields include:
- existing request/correlation ID;
- irreversible short message reference derived from the message ID;
- authentication class (`oidc`, temporary `legacy`, or `rejected`);
- package-match boolean;
- notification class;
- bounded outcome such as `processed`, `duplicate`, `retryable_failure`, or `rejected`.

Logs and public evidence must never contain bearer JWTs, shared secrets, purchase tokens, raw RTDN data, full service-account identifiers, or full message identifiers.

## Test strategy

Unit tests must cover:
- valid signed service identity;
- missing bearer token;
- malformed signature/token;
- expired token;
- wrong issuer;
- wrong audience;
- wrong caller email;
- unverified caller email claim;
- missing Pub/Sub message ID or data;
- malformed base64/RTDN JSON;
- package mismatch before Play lookup;
- first valid delivery processing exactly once;
- completed duplicate suppression;
- concurrent/in-progress duplicate retry behavior;
- same message ID with mismatched fingerprint/package;
- transient Play/D1 failure releasing the claim for retry;
- successful redelivery after a transient failure.

Runtime tests must exercise the Worker route boundary without production identifiers. During Phase A, tests cover both OIDC and the explicitly temporary legacy fallback. During Phase B, query/header shared-secret auth must have regression tests proving it is rejected.

Repository contract tests must prevent `PLAY_WEBHOOK_SECRET` from being reintroduced after Phase B and must require the OIDC production smoke contract.

## Production rollout and rollback

Phase A is implemented, reviewed, merged, and deployed from an exact reviewed `main` SHA only after fresh CI and CodeRabbit pass. The additive D1 migration is applied and read back before the compatibility Worker relies on it.

Then the Pub/Sub push subscription is changed to:
- the secret-free RTDN URL;
- authenticated push enabled;
- the intended push service account;
- the exact configured audience.

A real Google-authenticated delivery must be observed with sanitized evidence before Phase B starts. No production identifier or token is copied into the repository.

Phase B removes legacy auth in a separate reviewed PR and deploy. After deploy, production smoke/read-back must prove:
- no bearer token is rejected;
- legacy query token is rejected;
- legacy `X-Play-Secret` is rejected;
- valid expected OIDC identity passes authentication and reaches payload validation/processing;
- `PLAY_WEBHOOK_SECRET` is absent from the final Worker/config secret inventory.

Rollback before the Pub/Sub cutover may restore the captured pre-Phase-A Worker directly. After Pub/Sub has been changed to authenticated OIDC push, rollback order is strict: restore the prior legacy Pub/Sub push configuration first, prove the legacy boundary against the still-running Phase A compatibility Worker, and only then restore the captured pre-Phase-A Worker if necessary. Never roll the Worker back first while Pub/Sub still depends on OIDC. Rollback from Phase B restores the captured Phase A Worker version temporarily while retaining the legacy secret until recovery is proven. The additive D1 table is not dropped during rollback.

No rollback or verification step changes Play rollout percentage, subscription products, prices, purchase state, refund state, or customer entitlement manually.

## Issue #6 acceptance mapping

- Requests without a valid signed service identity are rejected by the OIDC-only final route.
- Token issuer, audience, expiry, expected caller identity, and verified-email claim are validated server-side.
- Authentication secrets are absent from the final webhook URL, request headers, backend auth path, and Worker secret inventory.
- D1 uniqueness plus the atomic claim protocol prevents duplicate notifications from applying a completed state transition twice.
- Package identity is taken from server configuration and every decoded notification must match it before Play lookup.
- Unit/runtime coverage includes valid, invalid, expired, duplicate, retry, and mismatched deliveries.
- Logging and evidence contain bounded correlation/outcome data but no tokens or sensitive payloads.

## Definition of done

Issue #6 may close only after both rollout phases are complete and independently read back from production. Required evidence includes fresh exact-head CI/review for each code phase, additive migration read-back, one real authenticated Google delivery, legacy-auth rejection after Phase B, duplicate suppression tests, final secret-inventory verification, and sanitized documentation.

If authenticated Pub/Sub configuration or safe retry/dead-letter behavior cannot be verified with available tooling, #6 remains open rather than inferring completion.
