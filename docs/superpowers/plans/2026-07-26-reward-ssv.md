# Rewarded Access SSV Implementation Plan

## Task 1 — Verification primitives

- [ ] Write failing tests for raw query parsing, base64url decoding, DER-to-P1363 conversion, ECDSA verification, unknown key, and malformed callbacks.
- [ ] Implement `backend/src/services/admobSsv.ts` using Web Crypto and an injectable key fetcher.
- [ ] Add bounded key caching below 24 hours.

## Task 2 — D1 challenge and entitlement model

- [ ] Add `reward_challenges` schema and migration SQL.
- [ ] Add typed rows and reward identifier validation.
- [ ] Write D1 route tests for prepare, expiry, conditional verification, transaction uniqueness, idempotency, consumption, and entitlement lookup.
- [ ] Replace KV reward lookup with D1 consumed entitlement lookup.

## Task 3 — Backend routes

- [ ] Add authenticated `POST /rewards/prepare`.
- [ ] Add public `GET /rewards/ssv` before JWT middleware.
- [ ] Change authenticated `POST /rewards/claim` to require a challenge ID.
- [ ] Add sanitized operational result logging and cron cleanup.
- [ ] Add runtime malformed-callback smoke coverage.

## Task 4 — Android SSV flow

- [ ] Add prepare/claim API models and repository behavior.
- [ ] Add reward challenge domain model.
- [ ] Add `ServerSideVerificationOptions` setup before ad display.
- [ ] Convert Daily and Weekly flows to prepare/show/claim effects.
- [ ] Add bounded delayed-callback polling and tests.

## Task 5 — Configuration and documentation

- [ ] Add `ADMOB_REWARDED_ID` to backend config typing, Doppler sync, examples, deploy validation, and docs without committing a real value.
- [ ] Document AdMob callback configuration and D1 migration commands.

## Task 6 — Verification

- [ ] Backend build, all unit tests, and Worker runtime tests.
- [ ] Android all JVM tests, Detekt, ktlint, debug APK, and release bundle dry-run.
- [ ] Secret scan and `git diff --check`.
- [ ] Commit in small reviewable units, push, create PR, and address review findings before merge.
