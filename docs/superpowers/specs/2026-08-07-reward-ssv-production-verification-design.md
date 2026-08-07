# Rewarded SSV Production Verification Design

**Date:** 2026-08-07
**Issue:** #2 — server-side verification for rewarded access
**Base:** `MakerParsDev/Astroloji:main` at `5dde5fa`

## Goal

Close the remaining production-readiness gap for rewarded access without redesigning the existing AdMob SSV architecture. The repository already implements authenticated reward challenges, signed AdMob callbacks, replay protection, one-time claim consumption, D1-backed entitlements, Android SSV wiring, transition routing, and redacted observability.

This work will prove those controls are active in production, repair only evidence-backed gaps, and close #2 only when every acceptance criterion is demonstrated.

## Non-goals

- Do not replace the existing `prepare -> SSV -> claim` protocol.
- Do not grant a reward from a client-side ad completion callback.
- Do not test against a real user's entitlement or production account data.
- Do not broaden the transition Worker route beyond `/api/v1/rewards/*`.
- Do not expose callback signatures, full user IDs, challenge IDs, transaction IDs, credentials, or production secret values.
- Do not combine #6 RTDN, #23 monetization E2E, or #22 Play Console compliance changes into this PR.

## Existing architecture to preserve

1. Android authenticates and calls `POST /api/v1/rewards/prepare` with the intended reward type and content identifier.
2. The backend creates a short-lived D1 challenge bound to the authenticated user and intended reward.
3. Android configures AdMob `ServerSideVerificationOptions` with backend user ID and opaque challenge data before showing the rewarded ad.
4. AdMob sends a signed callback to `GET /api/v1/rewards/ssv`.
5. The backend verifies Google's ECDSA signature and validates callback cardinality, encoding, timestamp, ad unit, user, challenge, expiry, and unique transaction ID.
6. D1 transitions the challenge from `pending` to `verified` only through a conditional update.
7. The Android reward callback only starts bounded claim polling; it never unlocks content directly.
8. `POST /api/v1/rewards/claim` consumes a verified challenge once and records the entitlement in D1.
9. Content access depends on an unexpired consumed D1 entitlement. Duplicate callbacks and duplicate claims are idempotent; transaction reuse across challenges is rejected.

## Verification strategy

Verification is evidence-first. Before any production mutation, inspect current live route, Worker, configuration inventory, D1 schema, release gates, and redacted SSV telemetry. If all required production components are already current, no deployment is performed.

If a production component is stale or missing, make the smallest repository change necessary, land it through a same-repository MakerParsDev PR with fresh CI/review on the exact head, then deploy only from reviewed merged `main` through the existing guarded workflow.

## Production challenge

Use the existing namespaced AdMob verification challenge mechanism rather than a real customer reward. The challenge must use the dedicated verification identifier and short-lived temporary verification user namespace already enforced by the backend tooling.

The production verification sequence is:

1. Confirm production-release gates remain closed and capture the exact reviewed `main` SHA.
2. Confirm the transition route and Worker currently serving reward endpoints match repository expectations.
3. Confirm the reward D1 migration and required secret names/configuration are present without printing secret values.
4. Create one short-lived verification challenge through the protected workflow/tooling.
5. Trigger the AdMob-signed verification callback using the provider's verification surface.
6. Read only bounded redacted evidence proving the signed callback reached the expected Worker and was accepted for that verification challenge.
7. Confirm duplicate/replay behavior from automated tests rather than issuing destructive production replays.
8. Delete the temporary challenge and temporary verification user and verify cleanup.

No real purchase, subscription mutation, Play rollout change, or customer reward entitlement is part of this flow.

## Failure and rollback behavior

Any failed invariant stops the flow before the next mutation. A stale route, unexpected Worker, missing migration, mismatched configuration, unsigned callback, rejected signature, missing redacted evidence, or cleanup failure is not treated as success.

If a reviewed deployment is required and its post-deploy route verification fails, use the existing transition rollback path to remove only the exact reward route and verify fall-through to the unchanged origin. Additive D1 reward state remains intact unless an independently reviewed migration rollback is explicitly required.

## Acceptance mapping

Issue #2 is complete only when evidence supports all of the following:

- A client request or local ad completion signal alone cannot grant rewarded access.
- Verification is bound to authenticated user, reward type/content identifier, short-lived challenge, and unique AdMob transaction.
- Malformed, unsigned, stale, expired, mismatched, replayed, and reused transactions are rejected.
- Exact callback retries and duplicate claim retries are idempotent and never duplicate entitlement.
- The Android client consumes only backend-verified reward state.
- Runtime tests cover accepted, rejected, duplicate, expiry, and replay paths.
- Production evidence proves the signed SSV callback reaches the intended production route and Worker.
- Verification-state cleanup succeeds and leaves no temporary test identity/challenge behind.
- Public evidence is sanitized and contains no secrets or exploit-enabling callback material.

## Test and evidence layers

Automated verification will include the existing backend verifier and reward route suites, transition Worker tests, Android rewarded SSV tests, reward claim polling tests, workflow contract tests, TypeScript/static checks, Android formatting/lint/unit/build gates, secret scans, and action workflow linting.

Production evidence records only exact reviewed commit SHA, workflow/run identifiers, route/Worker identity, boolean or allowlisted verification outcomes, sanitized challenge namespace/prefix evidence where already supported, cleanup outcome, and final gate state. Full identifiers and secret-bearing values remain outside public artifacts.

## Delivery boundary

This sub-project may end with an evidence/documentation-only PR if the implementation and production state already satisfy the contract. Code changes are allowed only when the audit finds a concrete acceptance gap. Production deployment is allowed after fresh tests, same-repository review, exact-head CI, merge to `main`, and the existing fail-closed workflow guards.

After #2 is verified and closed, the next independent sub-project is #6 Google Play RTDN/webhook authentication and replay handling, followed by #23 monetization end-to-end validation and #22 Play Console compliance verification.
