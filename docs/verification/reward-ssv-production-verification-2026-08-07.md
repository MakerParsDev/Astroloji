# Rewarded SSV Production Verification — 2026-08-07

## Reviewed code and release gates

- Repository: `MakerParsDev/Astroloji`.
- Cleanup hardening was reviewed in PR #63 at exact head `051b723b80d3805693ded54614df9601af2f5830`.
- PR #63 merged as `c516b37c5436952372d546c2e75b8961823c2055`; the reviewed head is a direct parent of the merge.
- Production release gate remained `ENABLE_PRODUCTION_RELEASE=false` throughout verification.
- The mobile contract remains `prepare -> provider SSV -> backend claim`; a client completion signal does not grant access directly.

## Local automated verification

- Repository workflow/contract suite passed before production verification.
- Backend build, unit tests, main runtime tests, transition build, and transition runtime tests passed.
- Android targeted rewarded-access tests passed for SSV configuration, claim polling, daily access, and weekly access.
- Focused replay/idempotency verification passed 28/28 tests after the signed callback.
- Covered rejection cases include transaction replay, expired challenge, user mismatch, ad-unit mismatch, timestamp rejection, and duplicate callback handling.

## Read-only production audit

- Public rewarded SSV preflight remained fail-closed with `400 / MALFORMED_CALLBACK` for a malformed callback.
- Exact rewarded route ownership was verified for Worker `astrology-ssv-transition`.
- Transition Worker secret inventory matched the expected names only: `ADMOB_REWARDED_ID` and `JWT_SECRET`.
- D1 reward challenge schema and its required uniqueness/index invariants were present.
- No infrastructure repair deployment was required.

## Signed AdMob verification challenge

- Create workflow run `31209839850` completed on merged `main` with redacted status `pending`.
- The authenticated AdMob SSV verification action succeeded and the verified URL was saved.
- Inspect workflow run `31209989856` completed on the same merged `main` and reported redacted status `verified` with a transaction prefix present.
- Callback telemetry workflow run `31210078157` reported `status: found`, `scriptName: astrology-ssv-transition`, and `outcome: verified`.
- No full temporary user ID, custom data value, signed callback URL, signature, or transaction identifier is recorded here.

## Cleanup verification

- Delete workflow run `31215984208` completed successfully on exact merged `main`.
- The delete workflow reported `cleanupVerified: true`, proving the temporary challenge and temporary verification user state were absent after deletion.
- Both temporary repository secret names used for the challenge were then removed and independently confirmed absent.
- The local mode-0600 temporary values file was removed.
- A final read-only check confirmed `ENABLE_PRODUCTION_RELEASE=false` and the public malformed-callback path remained fail-closed.

## Issue #2 acceptance mapping

- **A client request alone cannot grant rewarded access:** Android tests and the existing claim protocol keep client completion as a trigger for backend polling only.
- **Verification is bound to a user, reward type, and unique transaction/nonce:** D1 challenge state and signed provider callback binding are covered by backend tests and the verified provider challenge.
- **Replay, expired, malformed, or mismatched attempts are rejected:** focused backend tests cover transaction replay, expiry, malformed verification, user mismatch, ad-unit mismatch, and timestamp rejection.
- **Duplicate callbacks are idempotent:** focused backend coverage accepts an exact duplicate only as the same callback result and rejects cross-challenge replay.
- **Unit and runtime tests cover success, rejection, duplicate, and replay scenarios:** backend unit/runtime suites plus the focused 28-test regression gate passed.
- **Public documentation exposes no secrets or bypass instructions:** this document records only allowlisted booleans, names, SHAs, run IDs, and redacted outcomes.

## Remaining scope

- Issue #2 is limited to rewarded-access SSV and can be closed after this evidence receives fresh CI/review and is merged.
- RTDN/webhook security (#6), monetization end-to-end verification (#23), and Play Console compliance (#22) remain separate follow-up work.
- No real customer entitlement, Play rollout, subscription configuration, purchase, refund, or restore state was changed by this verification.
