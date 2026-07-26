# Google Play Production Readiness

Last reviewed: 2026-07-26

## Automated gates

- `main` CI must pass backend build/tests/runtime, Android Detekt/ktlint/unit tests, debug APK, and release AAB dry-run.
- `backend-production-deploy` must apply the rewarded SSV D1 migration, sync Doppler secrets, deploy the Worker, and verify the live fail-closed SSV endpoint.
- `android-internal-preflight` must validate Doppler release secrets, Firebase package identity, the Play service account, Play version codes, upload keystore credentials, production AdMob ID formats, live rewarded SSV, and the signed AAB.
- `android-internal-release` must pass the same live rewarded SSV gate before uploading.
- Production and metadata deployments use the `production` GitHub environment and must originate from `main`.

## Required deployment order

1. Merge and verify the rewarded SSV release.
2. In AdMob, enable SSV on the production rewarded ad unit with callback URL:
   `https://astrology.parsfilo.com/api/v1/rewards/ssv`
3. Run `backend-production-deploy` from `main` with confirmation `DEPLOY`; it applies the additive D1 migration, synchronizes secrets, and deploys the fail-closed claim contract.
4. Verify the live malformed-callback smoke test returns HTTP 400 with `MALFORMED_CALLBACK`.
5. Run the AdMob SSV testing tool and confirm a signed callback is accepted by the deployed endpoint.
6. Run `android-internal-preflight` from `main` with confirmation `PREFLIGHT`.
7. Publish to the internal track and complete real-device tests for rewarded daily/weekly unlock, subscription purchase/restore, consent, notifications, and account deletion.
8. Update Play Console declarations and submit a staged production release only after internal QA.

## Manual Play Console checks

- Data safety declarations match Firebase, Crashlytics, analytics, advertising identifiers, notifications, subscriptions, and backend account data.
- Account deletion is declared as supported and links to `https://astrology.parsfilo.com/delete-account`.
- Ads declaration, content rating, target audience, app access, privacy policy, and subscription/product declarations are current.
- Store screenshots, feature graphic, icon, Turkish/English text, support contact, and release notes are current.
- The existing production listing currently reports that data cannot be deleted; update this declaration before the next production submission.
- Keep `ENABLE_PRODUCTION_RELEASE=false` until all manual checks and internal QA are complete.

## Rollback

- Android: halt rollout or return to the last healthy Play release.
- Backend: redeploy the last healthy Worker version. The additive reward challenge table can remain in D1.
- Keep rewarded unlock fail-closed; do not restore the former client-only claim path during rollback.
