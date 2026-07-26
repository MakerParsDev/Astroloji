# Google Play Production Readiness

Last reviewed: 2026-07-26

## Automated gates

- `main` CI must pass backend build/tests/runtime, Android Detekt/ktlint/unit tests, debug APK, and release AAB dry-run.
- `backend-ssv-transition-deploy` must build the route-free Worker, apply the D1 migration, sync only transition secrets, attach the exact reward route, and pass live isolation checks.
- `backend-ssv-transition-rollback` must remove only the exact route before any optional Worker deletion.
- `android-internal-preflight` must validate Doppler release secrets, Firebase package identity, the Play service account, Play version codes, upload keystore credentials, production AdMob ID formats, live rewarded SSV, and the signed AAB.
- `android-internal-release` must pass the same live rewarded SSV gate before uploading.
- Production and metadata deployments use the `production` GitHub environment and must originate from `main`.

## Required rewarded SSV transition order

1. Merge the transition Worker change and require green CI/security checks.
2. Run `backend-ssv-transition-deploy` from `main` with:
   - confirmation `DEPLOY_TRANSITION`;
   - an ISO UTC `legacy_forward_until` no more than 30 days ahead (normally 14 days or less).
3. Confirm the workflow evidence contains:
   - Worker deployment ID;
   - route `astrology.parsfilo.com/api/v1/rewards/*` and its route ID;
   - D1 migration success;
   - compatibility deadline;
   - malformed callback HTTP 400 / `MALFORMED_CALLBACK`;
   - rollback workflow `backend-ssv-transition-rollback`.
4. Outside GitHub Actions, create the one-time AdMob verification values:

   ```bash
   cd backend
   npm run transition:challenge:create
   ```

5. In the production rewarded ad unit's SSV dialog enter exactly:

   ```text
   Callback URL: https://astrology.parsfilo.com/api/v1/rewards/ssv
   User ID: User ID printed by transition:challenge:create
   Custom data: challenge UUID printed by transition:challenge:create
   ```

6. Click **URL'yi doğrula**. Continue only after success; then click **Doğrulanan URL'yi kullan** and **Kaydet**. Do not save a failed verification.
7. Inspect the challenge by exact UUID and record only the challenge prefix, expiry, `verified` status, and transaction prefix:

   ```bash
   npm run transition:challenge:inspect -- <challenge-uuid>
   ```

8. Delete the one-time test challenge after evidence is recorded:

   ```bash
   npm run transition:challenge:delete -- <challenge-uuid>
   ```

9. Run `android-internal-preflight` from `main`, retain its workflow URL/result, and complete real-device rewarded daily/weekly QA before any Play release.
10. Keep `ENABLE_PRODUCTION_RELEASE=false`. Do not run `backend-production-deploy` until the secure Android rollout/cutover plan explicitly allows removal of the legacy compatibility path.

## Transition rollback

Run `backend-ssv-transition-rollback` with confirmation `REMOVE_TRANSITION_ROUTE`. It removes only the exact reward route, verifies origin health, confirms the SSV path falls back to the unchanged origin, and leaves the additive D1 migration intact. Worker deletion is optional and occurs only after route removal and origin verification.

## Manual Play Console checks

- Data safety declarations match Firebase, Crashlytics, analytics, advertising identifiers, notifications, subscriptions, and backend account data.
- Account deletion is declared as supported and links to `https://astrology.parsfilo.com/delete-account`.
- Ads declaration, content rating, target audience, app access, privacy policy, and subscription/product declarations are current.
- Store screenshots, feature graphic, icon, Turkish/English text, support contact, and release notes are current.
- The existing production listing currently reports that data cannot be deleted; update this declaration before the next production submission.
- Keep `ENABLE_PRODUCTION_RELEASE=false` until all manual checks and internal QA are complete.

## Rollback

- Android: halt rollout or return to the last healthy Play release.
- Transition: run `backend-ssv-transition-rollback`; the unchanged origin resumes reward traffic immediately and the additive D1 table remains.
- Full backend: do not redeploy or roll back `astrology-backend` as part of transition rollback.
- Keep rewarded unlock fail-closed; do not restore the former client-only claim path during rollback.
