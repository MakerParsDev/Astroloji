# Rewarded Access Server-Side Verification Design

**Date:** 2026-07-26
**Issue:** #2
**Branch:** `fix/reward-ssv-20260726`

## Security objective

A client-originated reward completion signal must never grant content access by itself. Access is granted only after an AdMob server-side verification callback is cryptographically validated and matched to a short-lived backend challenge created for the authenticated user and intended content period.

## Flow

1. Android calls `POST /api/v1/rewards/prepare` with `reward_type` and `identifier` using the application JWT.
2. Backend validates the identifier for the requested reward type, creates a random challenge in D1, and returns `challenge_id`, `user_id`, `custom_data`, and expiry.
3. Android sets AdMob `ServerSideVerificationOptions` on the loaded rewarded ad before showing it:
   - `userId` = authenticated backend user ID.
   - `customData` = opaque challenge ID.
4. AdMob calls `GET /api/v1/rewards/ssv` with its ordered signed query parameters.
5. Backend:
   - preserves the raw query substring before `signature` exactly;
   - fetches the AdMob ECDSA public key by `key_id`, caching the key document for less than 24 hours;
   - verifies the DER-encoded ECDSA/SHA-256 signature;
   - validates required fields, timestamp freshness, expected rewarded ad unit, user ID, challenge ID, reward type, content identifier, and challenge expiry;
   - records the unique AdMob `transaction_id` and marks the challenge verified with a conditional D1 update.
6. Android receives the client reward callback and calls `POST /api/v1/rewards/claim` with the challenge ID.
7. Backend conditionally consumes the verified challenge once, writes entitlement timestamps in the same D1 row, and returns success. Duplicate claim calls for the same user/challenge are idempotent.
8. Content endpoints grant reward access only from a consumed, unexpired D1 entitlement. KV is not the source of truth.

## Persistence

Add `reward_challenges`:

- `id TEXT PRIMARY KEY` — opaque random challenge / `custom_data`.
- `user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`.
- `reward_type TEXT NOT NULL CHECK (...)`.
- `identifier TEXT NOT NULL`.
- `status TEXT NOT NULL CHECK (pending, verified, consumed)`.
- `transaction_id TEXT UNIQUE`.
- `ad_unit TEXT`.
- `callback_timestamp_ms INTEGER`.
- `created_at`, `expires_at`, `verified_at`, `consumed_at`, `entitlement_expires_at`.

Indexes cover user/content entitlement lookup, expiry cleanup, and transaction idempotency.

Challenge lifetime is 10 minutes. Daily entitlement lifetime is 48 hours; weekly entitlement lifetime is 14 days, matching the previous product behavior. Expired challenge rows are periodically removed after an audit retention window.

## Verification and replay behavior

- Missing, duplicate, reordered terminal fields, malformed URL encoding, unknown key, invalid signature, stale/future timestamp, unknown/expired challenge, mismatched user, mismatched ad unit, and transaction reuse are rejected.
- An exact repeated callback for the same transaction/challenge returns HTTP 200 without granting twice, because Google retries callbacks when a 200 response is not observed.
- A transaction already attached to another challenge is rejected and never changes entitlement state.
- Logs contain request IDs, outcome codes, challenge prefixes, and transaction prefixes only; no full signature, raw query, user ID, or custom data is logged.

## Android behavior

Daily and weekly ViewModels use effects:

- `PrepareRewardUnlock` requests a challenge.
- `ShowRewardAd(challenge)` instructs the screen to apply SSV options and show the ad.
- `RewardEarned(challengeId)` performs bounded claim polling for delayed SSV delivery.

The ad is not shown if challenge preparation fails or if SSV options cannot be applied. Client reward callbacks only trigger claim polling; they never directly unlock content.

## Configuration

Backend receives `ADMOB_REWARDED_ID` through Doppler/Cloudflare configuration. The production value is not committed. Test environments use the official Google test rewarded ad unit ID.

The AdMob console must configure the callback URL:

`https://astrology.parsfilo.com/api/v1/rewards/ssv`

## Compatibility

- `/api/v1/rewards/claim` remains but its request changes to `challenge_id`; old unauthoritative requests fail closed.
- No new npm or Android dependency is required; Cloudflare Web Crypto verifies ECDSA and Android already includes Google Mobile Ads SDK.
- Existing content response shapes remain unchanged.

## Validation

- Pure verifier tests generate P-256 keys and signed callbacks.
- Route tests cover prepare, invalid client-only claim, verified claim, duplicate callback, duplicate claim, expiry, mismatch, malformed callback, and transaction replay.
- Runtime smoke verifies unauthenticated SSV route rejects malformed input without reaching entitlement writes.
- Android tests cover prepare effect, SSV context wiring, claim polling success/timeout, and no direct unlock from the ad callback.
- Full backend and Android CI chains remain green.
