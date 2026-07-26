# Rewarded Access SSV Implementation Plan

## Task 1 — Verification primitives

- [x] Write failing tests for raw query parsing, base64url decoding, DER-to-P1363 conversion, ECDSA verification, unknown key, and malformed callbacks.
- [x] Implement `backend/src/services/admobSsv.ts` using Web Crypto and an injectable key fetcher.
- [x] Add bounded key caching below 24 hours.

## Task 2 — D1 challenge and entitlement model

- [x] Add `reward_challenges` schema and migration SQL.
- [x] Add typed rows and reward identifier validation.
- [x] Write D1 route tests for prepare, expiry, conditional verification, transaction uniqueness, idempotency, consumption, and entitlement lookup.
- [x] Replace KV reward lookup with D1 consumed entitlement lookup.

## Task 3 — Backend routes

- [x] Add authenticated `POST /rewards/prepare`.
- [x] Add public `GET /rewards/ssv` before JWT middleware.
- [x] Change authenticated `POST /rewards/claim` to require a challenge ID.
- [x] Add sanitized operational result logging and cron cleanup.
- [x] Add runtime malformed-callback smoke coverage.

## Task 4 — Android SSV flow

- [x] Add prepare/claim API models and repository behavior.
- [x] Add reward challenge domain model.
- [x] Add `ServerSideVerificationOptions` setup before ad display.
- [x] Convert Daily and Weekly flows to prepare/show/claim effects.
- [x] Add bounded delayed-callback polling and tests.

## Task 5 — Configuration and documentation

- [x] Add `ADMOB_REWARDED_ID` to backend config typing, Doppler sync, examples, deploy validation, and docs without committing a real value.
- [x] Document AdMob callback configuration and D1 migration commands.

## Task 6 — Verification

- [x] Backend build, all unit tests, and Worker runtime tests.
- [x] Android all JVM tests, Detekt, ktlint, debug APK, and release bundle dry-run.
- [x] Secret scan and `git diff --check`.
- [ ] Push, create PR, and address review findings before merge.


## Verification evidence

- Backend TypeScript build: passed.
- Backend unit tests: 69/69 across 18 suites.
- Worker runtime tests: 4/4.
- Android JVM tests: 101/101 across 30 suites.
- Android Detekt and ktlint: passed.
- Android debug APK: assembled.
- Android release R8 and lint-vital: passed; release AAB dry-run is also enforced by GitHub CI and internal preflight.
- Release automation tests: 28/28.
- Play metadata validation: passed for `tr-TR` and `en-US`.
- Secret scan, workflow YAML parse, and diff checks: passed.
- AdMob account inspection confirmed the production Android app and a dedicated rewarded ad unit exist.
- GitHub `production` environment was created with a `main`-only deployment branch policy.

## Operational hold

Do not deploy the new backend or publish the Android update until the AdMob rewarded ad unit has SSV enabled with the documented callback URL. The release workflows fail closed on the live SSV check, and `ENABLE_PRODUCTION_RELEASE` remains false.
