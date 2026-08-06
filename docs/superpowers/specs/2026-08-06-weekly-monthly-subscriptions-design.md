# Weekly + Monthly Google Play Subscriptions Design

**Date:** 2026-08-06
**Repository:** `MakerParsDev/Astroloji`
**Target branch:** `fix/weekly-monthly-subscriptions-20260806`

## Goal

Replace the incomplete monthly/yearly subscription contract with a coherent monthly/weekly Google Play subscription model. The implementation must use the existing active Play products:

- `premium_monthly` with base plan `monthly` and billing period `P1M`
- `premium_weekly` with base plan `weekly` and billing period `P1W`

No yearly subscription product, UI copy, pricing calculation, backend allowlist entry, or reconciliation fallback will remain. The literal `premium_yearly` may remain only in explicit rejection or `UNKNOWN` regression tests.

## User Experience

The Premium screen will present two plans:

1. **Monthly** — first in display order and marked as the recommended option.
2. **Weekly** — second in display order and positioned as the lower-commitment entry option.

The UI will show prices and billing periods exactly as returned by Google Play. It will not calculate or claim yearly savings. It may calculate a clearly labelled monthly-equivalent comparison for the weekly price only when both prices and billing periods are available and valid; this comparison must not replace the actual Play price or imply a discount that Google Play does not provide.

The purchase button will remain disabled until a valid selected plan contains an offer token. When the catalogue cannot be loaded, the screen will show an actionable error state rather than an empty area under “Planını seç”. The state will include a retry action and a localized message that plans could not be loaded from Google Play.

## Android Billing Contract

`BillingManager` will query only:

- `premium_monthly`
- `premium_weekly`

Each returned `ProductDetails` object will be converted into one `PremiumPlanUi` using the preferred subscription offer. The selected offer rules remain:

1. Prefer an offer that contains a zero-priced trial phase.
2. Otherwise use the first available base-plan offer.
3. Never synthesize an offer token.

`QueryProductDetailsResult.unfetchedProductList` will be inspected and converted into structured diagnostics. The application will record product ID and status code without logging purchase tokens, account identifiers, credentials, or other sensitive values.

Catalogue load outcomes:

- At least one valid plan returned: display the returned plan or plans and keep diagnostics internal.
- No valid plans returned and unfetched products exist: expose a localized catalogue-unavailable error and retry action.
- Billing setup or query failure: expose the Billing response message through the existing safe error model.
- A single product unavailable: display the valid product and do not block the whole paywall.

The default selection will be monthly when available; otherwise it will be the first valid plan.

## Premium Presentation

The billing cadence model will contain `MONTHLY`, `WEEKLY`, and `UNKNOWN`. `MONTHLY` requires the exact tuple `premium_monthly` + `monthly` + `P1M`; `WEEKLY` requires `premium_weekly` + `weekly` + `P1W`. Any contradictory or unknown tuple maps to `UNKNOWN`. All `YEARLY` labels, strings, screenshot fixtures, and comparison calculations will be removed; only explicit yearly-rejection tests may retain the removed identifier.

Display priority:

1. `premium_monthly`
2. `premium_weekly`
3. unknown products

The monthly card will carry the localized “Önerilen” / “Recommended” badge. The weekly card will not be labelled as a discount. Purchase disclosure text will use the actual cadence returned by Play:

- monthly / aylık
- weekly / haftalık

Free-trial messaging is shown only when the selected Play offer contains a zero-priced phase. Remote Config cannot independently advertise a trial that is absent from the Play offer.

## Backend Contract

The canonical backend product allowlist will become:

```text
premium_monthly
premium_weekly
```

This contract applies to:

- `/subscriptions/verify`
- `/subscriptions/restore`
- stored subscription product IDs
- Play RTDN processing
- pending reconciliation audit
- fixtures, environment helpers, and unit/runtime tests

The purchase token remains the ownership key. Existing conflict protection, acknowledgement flow, premium entitlement calculation, grace period, account hold, cancellation, expiration, and RTDN secret boundary remain unchanged.

Pending reconciliation will attempt `premium_monthly` and then `premium_weekly`; it will no longer query `premium_yearly`.

## Release and Device Validation

The next Play internal-test build must use a version code greater than the currently installed sideload build (`1100`). The intended next version code is `1101` unless Play contains a higher code at release time; the release workflow must re-read Play and fail rather than reuse or lower the maximum version code.

The Redmi test device must validate Billing from a Play-recognized installation path:

- install through the internal test track, or
- use a license-tester account for an otherwise eligible signed build.

The existing sideload package with `installer=null` is not accepted as final proof of production Billing behaviour.

No real charge will be made without an explicit test-account/test-payment confirmation. The validation target is a Google Play test purchase.

## Testing Strategy

Implementation follows test-driven development.

### Android unit tests

Tests will first be changed to fail for the monthly/weekly contract, then implementation will make them pass. Coverage includes:

- recognized product IDs
- display order and cadence mapping
- monthly default selection
- weekly price and billing-period presentation
- removal of yearly savings behaviour
- free-trial selection rules
- unfetched-product diagnostics
- full catalogue failure state
- partial catalogue success
- purchase launch using the selected weekly or monthly offer token
- restore recognition for weekly purchases

### Android visual tests

Turkish and English Premium screenshot fixtures will use monthly and weekly products. Goldens will show monthly as recommended and weekly as the alternative. Empty-catalogue error rendering will receive a focused presentation test where supported by the current screenshot-test setup.

### Backend tests

Tests will cover:

- validator accepts `premium_monthly` and `premium_weekly`
- validator rejects `premium_yearly` and unknown products
- verify and restore persist weekly subscriptions
- RTDN extracts and processes `premium_weekly`
- reconciliation checks monthly and weekly products
- entitlement state transitions remain unchanged

### Full verification

The branch must pass:

- secret scan
- repository tooling tests
- backend build
- backend unit tests
- backend runtime tests
- transition runtime tests
- `npm audit --audit-level=moderate`
- Detekt
- ktlint
- Android Lint
- screenshot tests
- Android unit tests
- device-smoke APK compilation
- debug APK compilation
- release AAB dry run

A Play Developer API read-back must confirm that `premium_monthly` and `premium_weekly` are active and available. A device smoke must confirm that both plans are returned by BillingClient from the test installation path, prices are displayed, plan selection changes state, and launching the test purchase opens Google Play Billing.

## Error Handling and Observability

The implementation will not expose raw Billing debug internals to users. User-facing errors remain localized and actionable. Diagnostics will include:

- Billing response code
- safe debug message
- unfetched product ID
- unfetched status code
- count of valid returned plans

Diagnostics must exclude purchase tokens, OAuth tokens, Google account identifiers, Firebase tokens, and secrets.

The UI will never silently render an empty plan section after loading completes. Catalogue failures keep a real retry action; purchase and restore errors render as non-retry messages rather than no-op buttons. Concurrent catalogue loads use latest-request-wins semantics so stale results cannot overwrite newer state.

## Rollout and Safety

Work will be isolated on the feature branch. No Play product deletion, archive action, production rollout, backend deployment, or real purchase will occur as part of code implementation without a separate explicit approval.

Recommended rollout sequence:

1. Implement and verify the monthly/weekly contract.
2. Open and review a pull request.
3. Merge after CI is green.
4. Build signed version code `1101` or the next valid code.
5. Publish to the internal test track.
6. Install from Play on the Redmi test device.
7. Run Google Play test purchase, backend verification, restore, and RTDN checks.
8. Promote only after all acceptance checks pass.

## Acceptance Criteria

The work is accepted when all of the following are true:

- No production code references `premium_yearly`.
- Android and backend both recognize exactly `premium_monthly` and `premium_weekly`.
- Premium UI displays monthly first as recommended and weekly second.
- Empty or unfetched catalogues show a retryable error rather than a blank area.
- Weekly purchase and restore paths are covered by tests.
- All local and GitHub CI quality gates pass.
- Play API read-back confirms both products are active.
- A Play-installed internal-test build returns both product details on the Redmi device.
- A Google Play test purchase reaches backend verification and can be restored.
- No credential, token, or user data is printed during validation.
