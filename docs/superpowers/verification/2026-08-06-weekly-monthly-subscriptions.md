# Weekly + Monthly Subscription Verification Evidence

**Date:** 2026-08-06
**Branch:** `fix/weekly-monthly-subscriptions-20260806`
**Implementation HEAD verified:** `977f2cd`
**Base:** `origin/main` at `4117b59`
**Result:** Local implementation verification passed; no deployment or Play publication performed.

## Verified Product Contract

Production Android and backend code recognize exactly:

- `premium_monthly` / base plan `monthly` / period `P1M`
- `premium_weekly` / base plan `weekly` / period `P1W`

A production-path grep returned no matches for:

```text
premium_yearly
PremiumBillingCadence.YEARLY
premium_yearly_label
premium_yearly_savings_percent
premium_period_yearly
```

Three test-only negative fixtures intentionally retain `premium_yearly` to prove the removed product is rejected or mapped to `UNKNOWN`:

- `BillingManagerTest.kt`
- `PremiumOfferPresentationTest.kt`
- `validators.test.ts`

## Root Tooling and Secret Scan

Commands:

```bash
node scripts/scan-secrets.mjs
node --test scripts/*.test.mjs
```

Result:

- Secret scan: passed
- Root tooling tests: **92 passed, 0 failed**
- Exit code: `0`

## Backend Verification

Commands:

```bash
cd backend
npm ci
npm audit --audit-level=moderate
npm run build
npm run build:transition
npm test
npm run test:runtime
npm run test:runtime:transition
```

Result:

- npm audit: **0 vulnerabilities**
- TypeScript/Wrangler build: passed
- Transition Worker dry-run build: passed
- Unit/service/worker tests: **29 files, 192 tests passed**
- Worker runtime tests: **4 passed**
- Transition runtime tests: **4 passed**
- Exit code: `0`

Weekly coverage includes validator acceptance, verify, restore, RTDN lookup, persistence, subscription events, and pending reconciliation fallback.

## Android Verification

The local run used Java 21, the configured Android SDK, the checked-in Firebase placeholder, screenshot-test enablement, and the same 3 GiB heap / 1 GiB metaspace limits used by CI.

Commands:

```bash
cd Astroloji
bash ./gradlew :app:detekt
bash ./gradlew :app:ktlintCheck
bash ./gradlew :app:lintDebug
bash ./gradlew :app:validateDebugScreenshotTest
bash ./gradlew :app:testDebugUnitTest
bash ./gradlew :device-smoke:assembleDebug :device-smoke:assembleDebugAndroidTest
bash ./gradlew :app:assembleDebug
bash ./gradlew :app:bundleRelease
```

The screenshot command was run with:

```text
android.experimental.enableScreenshotTest=true
android.sync.suppressAgpWarnings=UNSUPPORTED_PROJECT_OPTION_USE
```

Result:

- Detekt: passed
- ktlint: passed
- Android Lint: **0 issues**
- Turkish and English Premium golden tests: **2 passed**
- Android unit tests: **39 result files, 156 tests passed, 0 failed, 0 skipped**
- Device-smoke application and instrumentation APK compilation: passed
- Debug APK compilation: passed
- Release AAB dry-run: passed
- Exit code: `0`

Artifacts:

```text
Astroloji/app/build/outputs/apk/debug/app-debug.apk
  33,924,265 bytes

Astroloji/app/build/outputs/bundle/release/app-release.aab
  15,824,521 bytes

Astroloji/device-smoke/build/outputs/apk/debug/device-smoke-debug.apk
  5,228,815 bytes

Astroloji/device-smoke/build/outputs/apk/androidTest/debug/device-smoke-debug-androidTest.apk
  1,738,067 bytes
```

The complete local verification job ran from `2026-08-06T15:12:42+03:00` to `2026-08-06T15:21:01+03:00` and ended with `exit_code=0`.

## Google Play Read-Back

The Android Publisher API was queried read-only using a temporary `0600` credential file. The credential and access token were not printed and the temporary files were deleted by a shell trap.

Release/version result:

```json
{
  "packageAccess": true,
  "trackCount": 4,
  "maxVersionCode": 22,
  "recommendedVersionCode": 1101
}
```

Subscription catalogue result:

| Product | Base plan | State | Period | Regional configs | New-subscriber regions | Offers | Listings |
|---|---|---|---|---:|---:|---:|---|
| `premium_monthly` | `monthly` | `ACTIVE` | `P1M` | 173 | 173 | 0 | `en-US`, `tr-TR` |
| `premium_weekly` | `weekly` | `ACTIVE` | `P1W` | 173 | 173 | 0 | `en-US`, `tr-TR` |

The Play catalogue contains exactly these two subscription products.

## Behaviour Verified by Tests

- Android queries only monthly and weekly products.
- Monthly is selected first and shown as the recommended plan.
- Weekly is a valid selectable and purchasable alternative.
- Purchase readiness requires both a real Play price and a non-empty offer token.
- Partial catalogue success displays the returned valid plan.
- A fully unavailable catalogue produces a localized retryable error instead of placeholder cards or an empty section.
- `unfetchedProductList` diagnostics retain only product ID and status code.
- Trial copy is shown only when the selected Play offer contains a zero-priced pricing phase.
- Backend validation rejects yearly and unknown product IDs.
- Weekly verify, restore, RTDN, persistence, and reconciliation paths are covered.
- Internal release tooling requires `max(Play max + 1, 1101)` and rejects a lower requested version before build or publish.

## Actions Deliberately Not Performed

No action in this implementation run changed production state:

- No Google Play product was created, modified, archived, or deleted.
- No AAB or APK was uploaded to Google Play.
- No internal, staged, or production rollout was started.
- No backend Worker was deployed.
- No database migration or production data mutation was executed.
- No real or test subscription purchase was launched.
- No purchase token, OAuth token, Google account identifier, Firebase token, or secret was printed.

## Remaining Gated Acceptance

These steps require separate execution approval because they publish software, change the device installation path, or initiate a payment flow:

1. Review and merge the pull request after GitHub CI is green.
2. Run `android-internal-preflight` with version code `1101` or a higher value returned by the workflow.
3. Publish the signed bundle to the Google Play internal track.
4. Confirm the Redmi Google account is both an internal tester and a license tester.
5. Replace or safely migrate the current sideload installation (`versionCode=1100`, `installer=null`) with the Play internal-test installation.
6. Confirm BillingClient returns both products and localized prices on that Play-installed build.
7. Launch a Google Play test purchase using a test payment method; no real charge.
8. Record backend verify, acknowledgement, premium-state persistence, restore, RTDN renewal/cancellation, grace-period, account-hold, and expiration evidence.

## Non-Blocking Technical Notes

- Gradle reports deprecated features that will need remediation before Gradle 10.
- The build reports that a small set of packaged native libraries cannot be stripped; this is informational and did not fail debug, smoke, or release builds.
