# Weekly + Monthly Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Google Play subscriptions use exactly `premium_monthly` and `premium_weekly`, show monthly as the recommended default, expose retryable catalogue failures, and validate the contract through backend, Android, Play API, and device tests.

**Architecture:** Keep the existing BillingManager → PremiumViewModel → Compose flow, but make catalogue loading return an explicit result instead of silently leaving an empty plan list. Keep the backend purchase-token ownership model and Google Play verification service unchanged while replacing the yearly SKU everywhere with the weekly SKU. Release safety remains workflow-driven: code changes and test artefacts are allowed on the feature branch, while Play publishing, backend deployment, and test-purchase confirmation remain separate approval gates.

**Tech Stack:** Kotlin, Jetpack Compose, Google Play Billing 9.1.0, Coroutines/StateFlow, JUnit/Truth/MockK, Compose screenshot tests, TypeScript, Hono, Zod, Vitest, Cloudflare Workers/D1, GitHub Actions, Google Play Android Publisher API.

## Global Constraints

- Canonical products are exactly `premium_monthly` and `premium_weekly`.
- Canonical base plans are `monthly` (`P1M`) and `weekly` (`P1W`).
- `premium_yearly`, `YEARLY`, yearly labels, and yearly savings logic must not remain in production code or fixtures.
- Monthly is displayed first, selected by default when available, and labelled `Recommended` / `Önerilen`.
- Weekly is displayed second and must never be presented as a Google Play discount.
- Prices and billing periods displayed to users come from Google Play `ProductDetails`.
- Trial copy is shown only when the selected Play offer contains a zero-priced pricing phase.
- A complete catalogue failure must show a localized retry action; a partial catalogue failure must still display valid plans.
- Diagnostics may include response codes, safe debug messages, product IDs, unfetched status codes, and valid-plan counts, but never purchase tokens, account identifiers, OAuth tokens, Firebase tokens, or secrets.
- The next internal-test version code must be at least `1101` and greater than every version code currently known to Play.
- Do not archive/delete Play products, deploy backend production, publish production, or make a real charge as part of implementation.

## File Map

- `backend/src/types.ts`: canonical backend product union.
- `backend/src/utils/validators.ts`: request validation derived from the canonical union.
- `backend/src/workers/subscription.ts`: verify, restore, RTDN, and pending reconciliation behaviour.
- `backend/tests/utils/validators.test.ts`: SKU acceptance/rejection contract.
- `backend/tests/workers/subscription.test.ts`: weekly RTDN, verify, restore, and reconciliation regression coverage.
- `backend/tests/workers/content.test.ts`: fallback subscription fixture migration.
- `backend/tests/helpers/env.ts`: remove stale yearly test bindings and add weekly bindings only where consumed.
- `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/repository/BillingManager.kt`: queried products, catalogue diagnostics, load result, purchase/restore recognition, display priority.
- `Astroloji/app/src/test/java/com/parsfilo/astrology/core/data/repository/BillingManagerTest.kt`: Billing contract and diagnostics unit tests.
- `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium/PremiumViewModel.kt`: catalogue load lifecycle, default selection, retry event, error state.
- `Astroloji/app/src/test/java/com/parsfilo/astrology/feature/premium/PremiumViewModelTest.kt`: monthly default, weekly selection/purchase, retry, full/partial catalogue outcomes.
- `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium/PremiumOfferLabels.kt`: monthly/weekly/unknown cadence labels.
- `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium/PremiumOfferComponents.kt`: monthly recommended badge and no yearly savings UI.
- `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium/PremiumScreen.kt`: real error state with retry; no placeholder plans after loading.
- `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium/PremiumStatusComponents.kt`: preview fixtures migrated to weekly.
- `Astroloji/app/src/main/res/values/strings.xml` and `values-tr/strings.xml`: weekly labels and catalogue failure copy; yearly copy removed.
- `Astroloji/app/src/test/java/com/parsfilo/astrology/feature/premium/PremiumOfferPresentationTest.kt`: cadence and readiness presentation tests.
- `Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/feature/premium/PremiumOfferScreenshotTest.kt`: monthly/weekly visual fixtures.
- `Astroloji/app/src/screenshotTest/reference/**`: regenerated Turkish and English paywall goldens.
- `scripts/check-play-release-access.mjs`: reusable required-version calculation.
- `scripts/check-play-release-access.test.mjs`: version floor tests.
- `.github/workflows/android-internal-preflight.yml`: reject input below Play/device floor.
- `.github/workflows/android-internal-release.yml`: repeat the same guard before publishing.

---

### Task 1: Canonical Backend Product Contract

**Files:**
- Modify: `backend/src/types.ts:21`
- Modify: `backend/tests/utils/validators.test.ts`
- Modify: `backend/tests/helpers/env.ts:48-49`

**Interfaces:**
- Consumes: `validateSubscriptionBody(payload: unknown)` from `backend/src/utils/validators.ts`.
- Produces: `SUBSCRIPTION_PRODUCTS = ['premium_monthly', 'premium_weekly'] as const` and `SubscriptionProductId` derived from it.

- [ ] **Step 1: Write failing validator tests for the new exact allowlist**

Add tests equivalent to:

```ts
it.each(['premium_monthly', 'premium_weekly'])(
  'accepts supported subscription product %s',
  (productId) => {
    expect(
      validateSubscriptionBody({
        purchase_token: 'purchase-token',
        product_id: productId
      })
    ).toEqual({
      purchase_token: 'purchase-token',
      product_id: productId
    });
  }
);

it.each(['premium_yearly', 'premium_daily', 'unknown']) (
  'rejects unsupported subscription product %s',
  (productId) => {
    expect(() =>
      validateSubscriptionBody({
        purchase_token: 'purchase-token',
        product_id: productId
      })
    ).toThrow();
  }
);
```

- [ ] **Step 2: Run the focused test and verify red state**

Run:

```bash
cd backend
npm ci
npm test -- tests/utils/validators.test.ts
```

Expected: the `premium_weekly` acceptance test fails and the `premium_yearly` rejection test fails.

- [ ] **Step 3: Replace the backend canonical product union**

Change:

```ts
export const SUBSCRIPTION_PRODUCTS = ['premium_monthly', 'premium_yearly'] as const;
```

To:

```ts
export const SUBSCRIPTION_PRODUCTS = ['premium_monthly', 'premium_weekly'] as const;
```

Remove stale `PREMIUM_YEARLY_PRODUCT_ID` test-environment data. Add `PREMIUM_WEEKLY_PRODUCT_ID: 'premium_weekly'` only if a test consumes the named binding; otherwise remove both non-runtime helper fields and rely on `SUBSCRIPTION_PRODUCTS`.

- [ ] **Step 4: Run focused tests and TypeScript build**

Run:

```bash
cd backend
npm test -- tests/utils/validators.test.ts
npm run build
```

Expected: focused tests pass and TypeScript exits `0`.

- [ ] **Step 5: Commit the canonical backend contract**

```bash
git add backend/src/types.ts backend/tests/utils/validators.test.ts backend/tests/helpers/env.ts
git commit -m "fix(backend): support weekly subscription product"
```

---

### Task 2: Weekly Verify, Restore, RTDN, and Reconciliation

**Files:**
- Modify: `backend/src/workers/subscription.ts:202-451`
- Modify: `backend/tests/workers/subscription.test.ts`
- Modify: `backend/tests/workers/content.test.ts:159-190`

**Interfaces:**
- Consumes: `SubscriptionProductId`, `verifySubscriptionPurchase`, `getSubscriptionStatus`, `processSubscription`.
- Produces: reconciliation order `['premium_monthly', 'premium_weekly']`; weekly request and RTDN support through the existing routes.

- [ ] **Step 1: Add failing weekly RTDN and request-route tests**

Add a weekly RTDN case using:

```ts
subscriptionNotification: {
  purchaseToken: 'weekly-purchase-token',
  subscriptionId: 'premium_weekly',
  notificationType: 4
}
```

Assert `getSubscriptionStatusMock` receives:

```ts
expect(getSubscriptionStatusMock).toHaveBeenCalledWith(
  expect.anything(),
  'weekly-purchase-token',
  'premium_weekly',
  'com.parsfilo.astrology'
);
```

Add authenticated `/api/v1/subscriptions/verify` and `/api/v1/subscriptions/restore` tests with `product_id: 'premium_weekly'`. Mock `verifySubscriptionPurchaseMock` to return a `GooglePlaySubscription` whose `productId` is `premium_weekly`, then assert HTTP `200`, response `product_id`, and D1 write bindings contain `premium_weekly`.

Add an audit test where the monthly lookup returns `null` and the weekly lookup returns an active subscription; assert the second lookup uses `premium_weekly` and the user/subscription rows are updated.

- [ ] **Step 2: Run the focused worker tests and verify red state**

Run:

```bash
cd backend
npm test -- tests/workers/subscription.test.ts tests/workers/content.test.ts
```

Expected: audit/reconciliation still requests `premium_yearly`, and any stale yearly fixture expectation fails.

- [ ] **Step 3: Replace yearly reconciliation and fixtures**

In `registerSubscriptionAdminRoutes`, replace the second status lookup argument:

```ts
'premium_yearly'
```

With:

```ts
'premium_weekly'
```

Replace `buildFallbackSubscriptionResponse('premium_yearly', ...)` fixtures with `premium_weekly`. Do not change token ownership, entitlement calculation, status normalization, rate limiting, or RTDN authentication.

- [ ] **Step 4: Run backend subscription, billing-service, and runtime tests**

Run:

```bash
cd backend
npm test -- tests/workers/subscription.test.ts tests/workers/content.test.ts tests/services/playBilling.test.ts tests/utils/validators.test.ts
npm run test:runtime
npm run test:runtime:transition
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit backend lifecycle support**

```bash
git add backend/src/workers/subscription.ts backend/tests/workers/subscription.test.ts backend/tests/workers/content.test.ts
git commit -m "fix(backend): reconcile weekly subscriptions"
```

---

### Task 3: Android Billing Catalogue Contract and Diagnostics

**Files:**
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/repository/BillingManager.kt`
- Modify: `Astroloji/app/src/test/java/com/parsfilo/astrology/core/data/repository/BillingManagerTest.kt`
- Modify: `Astroloji/app/src/main/res/values/strings.xml:217-223`
- Modify: `Astroloji/app/src/main/res/values-tr/strings.xml:217-223`

**Interfaces:**
- Produces:
  - `data class BillingCatalogueDiagnostic(val productId: String, val statusCode: Int)`
  - `sealed interface BillingCatalogueLoadResult`
  - `data class Success(val plans: List<PremiumPlanUi>, val diagnostics: List<BillingCatalogueDiagnostic>)`
  - `data class Failure(val message: String, val diagnostics: List<BillingCatalogueDiagnostic>)`
  - `suspend fun loadPlans(): BillingCatalogueLoadResult`
  - `internal fun defaultPremiumPlan(plans: List<PremiumPlanUi>): PremiumPlanUi?`
- Consumes: Billing 9.1.0 `QueryProductDetailsResult.productDetailsList` and `unfetchedProductList`.

- [ ] **Step 1: Replace yearly tests and add failing catalogue-result tests**

Update recognized-product expectations:

```kotlin
assertThat(resolveRecognizedProductId(listOf("premium_weekly")))
    .isEqualTo("premium_weekly")
assertThat(resolveRecognizedProductId(listOf("premium_weekly", "premium_monthly")))
    .isNull()
assertThat(resolveRecognizedProductId(listOf("premium_yearly")))
    .isNull()
```

Update stable plan ID coverage to `premium_weekly:weekly:trial`.

Delete `calculateYearlySavingsPercent` coverage. Add tests for:

```kotlin
assertThat(defaultDisplayPriority("premium_monthly")).isEqualTo(0)
assertThat(defaultDisplayPriority("premium_weekly")).isEqualTo(1)
assertThat(defaultPremiumPlan(listOf(weeklyPlan, monthlyPlan))).isEqualTo(monthlyPlan)
assertThat(defaultPremiumPlan(listOf(weeklyPlan))).isEqualTo(weeklyPlan)
```

Add a pure helper:

```kotlin
internal fun resolveCatalogueLoadResult(
    plans: List<PremiumPlanUi>,
    diagnostics: List<BillingCatalogueDiagnostic>,
    queryMessage: String?,
    catalogueUnavailableMessage: String,
): BillingCatalogueLoadResult
```

Test that non-empty plans produce `Success` even with diagnostics, while zero plans plus diagnostics produce `Failure(catalogueUnavailableMessage, diagnostics)`.

- [ ] **Step 2: Run focused Android tests and verify red state**

Run:

```bash
cd Astroloji
./gradlew :app:testDebugUnitTest --tests '*BillingManagerTest'
```

Expected: compilation/test failures because weekly constants and catalogue result helpers do not exist.

- [ ] **Step 3: Implement monthly/weekly query and safe diagnostics**

Use:

```kotlin
private const val PRODUCT_PREMIUM_MONTHLY = "premium_monthly"
private const val PRODUCT_PREMIUM_WEEKLY = "premium_weekly"
private val PREMIUM_PRODUCT_IDS = setOf(PRODUCT_PREMIUM_MONTHLY, PRODUCT_PREMIUM_WEEKLY)
```

Query only those two IDs. Convert `unfetchedProductList` to diagnostics containing only `productId` and `statusCode`. Log diagnostics with `Timber.w` without any purchase/account/token data. Set `_plans` to the valid returned plans and return an explicit `BillingCatalogueLoadResult`.

Add localized strings:

```xml
<string name="billing_catalogue_unavailable">Subscription plans could not be loaded from Google Play. Try again.</string>
```

```xml
<string name="billing_catalogue_unavailable">Abonelik planları Google Play’den yüklenemedi. Tekrar dene.</string>
```

Make `defaultDisplayPriority` internal and order monthly `0`, weekly `1`, unknown `Int.MAX_VALUE`.

- [ ] **Step 4: Verify focused tests and static analysis**

Run:

```bash
cd Astroloji
./gradlew :app:testDebugUnitTest --tests '*BillingManagerTest'
./gradlew :app:detekt :app:ktlintCheck
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit Billing catalogue support**

```bash
git add Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/repository/BillingManager.kt \
  Astroloji/app/src/test/java/com/parsfilo/astrology/core/data/repository/BillingManagerTest.kt \
  Astroloji/app/src/main/res/values/strings.xml \
  Astroloji/app/src/main/res/values-tr/strings.xml
git commit -m "fix(android): load monthly and weekly billing plans"
```

---

### Task 4: Premium ViewModel Default Selection, Retry, and Failure State

**Files:**
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium/PremiumViewModel.kt`
- Modify: `Astroloji/app/src/test/java/com/parsfilo/astrology/feature/premium/PremiumViewModelTest.kt`

**Interfaces:**
- Consumes: `BillingManager.loadPlans(): BillingCatalogueLoadResult`, `defaultPremiumPlan`.
- Produces:
  - `PremiumUiEvent.RetryCatalogue`
  - `PremiumUiState.catalogueDiagnosticsCount: Int = 0` only if needed for bounded analytics/diagnostics; do not expose raw codes in UI.
  - `private fun loadCatalogue()` shared by initialization and retry.

- [ ] **Step 1: Convert fixtures to monthly and weekly and write failing state tests**

Define weekly fixture:

```kotlin
private val weeklyPlan =
    PremiumPlanUi(
        planId = "premium_weekly:weekly:default",
        productId = "premium_weekly",
        basePlanId = "weekly",
        offerToken = "weekly-offer-token",
        title = "Weekly",
        price = "TRY 129.99",
        priceAmountMicros = 129_990_000L,
        billingPeriod = "P1W",
    )
```

Make monthly fixture include `basePlanId = "monthly"`, `offerToken = "monthly-offer-token"`, and `billingPeriod = "P1M"`.

Add tests that:

- plans returned `[weeklyPlan, monthlyPlan]` select `monthlyPlan.planId` by default;
- weekly-only success selects weekly;
- `Failure("catalogue unavailable", ...)` sets `isLoading=false`, `plans=[]`, `selectedPlanId=""`, and `error`;
- `RetryCatalogue` sets loading state and calls `loadPlans` a second time;
- selecting weekly emits weekly analytics metadata;
- purchasing weekly calls `launchPurchase(activity, weeklyPlan.planId)`;
- no `yearlySavingsPercent` field or assertion remains.

Mock sequential load results with `coEvery { billingManager.loadPlans() } returnsMany listOf(failure, success)`.

- [ ] **Step 2: Run focused ViewModel tests and verify red state**

Run:

```bash
cd Astroloji
./gradlew :app:testDebugUnitTest --tests '*PremiumViewModelTest'
```

Expected: failures for missing `RetryCatalogue`, old `Unit` return type, yearly field, and first-item default selection.

- [ ] **Step 3: Implement a single catalogue-loading state machine**

Replace initialization’s inline load sequence with:

```kotlin
private fun loadCatalogue() {
    viewModelScope.launch {
        setState { copy(isLoading = true, error = null) }
        val result = billingManager.loadPlans()
        when (result) {
            is BillingCatalogueLoadResult.Success -> {
                val selected = defaultPremiumPlan(result.plans)
                setState {
                    copy(
                        isLoading = false,
                        plans = result.plans,
                        selectedPlanId = selected?.planId.orEmpty(),
                        trialDays = resolveTrialDays(selected, merchandisingTrialDays),
                        error = null,
                    )
                }
            }
            is BillingCatalogueLoadResult.Failure ->
                setState {
                    copy(
                        isLoading = false,
                        plans = emptyList(),
                        selectedPlanId = "",
                        trialDays = 0,
                        error = result.message,
                    )
                }
        }
    }
}
```

Fetch preferences and Remote Config once during initialization, then call `loadCatalogue()`. Route `RetryCatalogue` to the same method. Remove `yearlySavingsPercent` and `calculateSavings` entirely.

- [ ] **Step 4: Run focused tests**

Run:

```bash
cd Astroloji
./gradlew :app:testDebugUnitTest --tests '*PremiumViewModelTest'
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit Premium state lifecycle**

```bash
git add Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium/PremiumViewModel.kt \
  Astroloji/app/src/test/java/com/parsfilo/astrology/feature/premium/PremiumViewModelTest.kt
git commit -m "fix(android): expose retryable billing catalogue state"
```

---

### Task 5: Monthly-Recommended and Weekly Premium Presentation

**Files:**
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium/PremiumOfferPresentation.kt` if cadence enum/helper is defined there
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium/PremiumOfferLabels.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium/PremiumOfferComponents.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium/PremiumScreen.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium/PremiumStatusComponents.kt`
- Modify: `Astroloji/app/src/main/res/values/strings.xml:76-89`
- Modify: `Astroloji/app/src/main/res/values-tr/strings.xml:76-89`
- Modify: `Astroloji/app/src/test/java/com/parsfilo/astrology/feature/premium/PremiumOfferPresentationTest.kt`

**Interfaces:**
- Produces: `PremiumBillingCadence.MONTHLY`, `WEEKLY`, `UNKNOWN`; `isRecommendedPremiumPlan(plan)` returning true only for monthly.
- Consumes: `PremiumUiEvent.RetryCatalogue` and `PremiumUiState.error`.

- [ ] **Step 1: Write failing cadence, recommendation, and empty-catalogue tests**

Update cadence tests:

```kotlin
assertThat(premiumBillingCadence(plan("premium_monthly", "TRY 394.99", "P1M")))
    .isEqualTo(PremiumBillingCadence.MONTHLY)
assertThat(premiumBillingCadence(plan("premium_weekly", "TRY 129.99", "P1W")))
    .isEqualTo(PremiumBillingCadence.WEEKLY)
assertThat(premiumBillingCadence(plan("premium_yearly", "TRY 999.99", "P1Y")))
    .isEqualTo(PremiumBillingCadence.UNKNOWN)
assertThat(isRecommendedPremiumPlan(monthlyPlan)).isTrue()
assertThat(isRecommendedPremiumPlan(weeklyPlan)).isFalse()
```

Add a presentation test for `isPremiumOfferReady` requiring non-blank price and offer token. Ensure no test references yearly savings.

- [ ] **Step 2: Run focused tests and verify red state**

Run:

```bash
cd Astroloji
./gradlew :app:testDebugUnitTest --tests '*PremiumOfferPresentationTest'
```

Expected: weekly/unknown enum and recommendation helper are missing.

- [ ] **Step 3: Implement labels, badge, and retry rendering**

Use enum values:

```kotlin
enum class PremiumBillingCadence {
    MONTHLY,
    WEEKLY,
    UNKNOWN,
}
```

Map weekly period `P1W` and product `premium_weekly` to `WEEKLY`. Map unrecognized products to `UNKNOWN` without throwing.

Replace yearly strings with:

```xml
<string name="premium_weekly_label">Weekly</string>
<string name="premium_recommended">Recommended</string>
<string name="premium_period_weekly">weekly</string>
<string name="premium_period_unknown">according to the selected Google Play plan</string>
```

And Turkish:

```xml
<string name="premium_weekly_label">Haftalık</string>
<string name="premium_recommended">Önerilen</string>
<string name="premium_period_weekly">haftalık</string>
<string name="premium_period_unknown">seçilen Google Play planına göre</string>
```

Remove `premium_yearly_label`, `premium_yearly_savings_percent`, and `premium_period_yearly` where no longer referenced.

Show the badge only when `isRecommendedPremiumPlan(plan)`. Remove the savings block from `PremiumOfferSummary`.

In `PremiumScreen`, do not call `placeholderPremiumPlans()` after loading. Render one of three states:

1. active premium card when `isAlreadyPremium`;
2. `ErrorState(message = uiState.error, onRetry = { RetryCatalogue })` when no plans and an error exists;
3. real `PremiumOfferCard` only when a selected real plan exists.

Purchase remains disabled until `isPremiumOfferReady(selected)` and an `Activity` are available. Keep benefits, continue-free, restore, and success cards reachable as appropriate.

- [ ] **Step 4: Run presentation tests, lint, and Compose compilation**

Run:

```bash
cd Astroloji
./gradlew :app:testDebugUnitTest --tests '*PremiumOfferPresentationTest' --tests '*PremiumViewModelTest'
./gradlew :app:lintDebug :app:detekt :app:ktlintCheck
```

Expected: all commands exit `0`; Android Lint reports zero issues.

- [ ] **Step 5: Commit Premium presentation**

```bash
git add Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium \
  Astroloji/app/src/main/res/values/strings.xml \
  Astroloji/app/src/main/res/values-tr/strings.xml \
  Astroloji/app/src/test/java/com/parsfilo/astrology/feature/premium/PremiumOfferPresentationTest.kt
git commit -m "fix(android): present monthly and weekly premium plans"
```

---

### Task 6: Monthly/Weekly Screenshot Regression Coverage

**Files:**
- Modify: `Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/feature/premium/PremiumOfferScreenshotTest.kt`
- Modify: `Astroloji/app/src/screenshotTest/reference/**/PremiumOffer*png`

**Interfaces:**
- Consumes: `PremiumUiState`, `PremiumOfferCard`, monthly/weekly strings.
- Produces: checked-in Turkish and English paywall goldens with monthly recommended and weekly alternative.

- [ ] **Step 1: Migrate screenshot fixtures and verify old golden mismatch**

Use monthly fixture:

```kotlin
PremiumPlanUi(
    planId = "premium_monthly:monthly:default",
    productId = "premium_monthly",
    basePlanId = "monthly",
    offerToken = "monthly-token",
    title = "Monthly",
    price = "₺394,99",
    priceAmountMicros = 394_990_000L,
    billingPeriod = "P1M",
)
```

Use weekly fixture:

```kotlin
PremiumPlanUi(
    planId = "premium_weekly:weekly:default",
    productId = "premium_weekly",
    basePlanId = "weekly",
    offerToken = "weekly-token",
    title = "Weekly",
    price = "₺129,99",
    priceAmountMicros = 129_990_000L,
    billingPeriod = "P1W",
)
```

Select monthly by default and remove `yearlySavingsPercent`.

Run:

```bash
cd Astroloji
./gradlew :app:validateDebugScreenshotTest
```

Expected: FAIL because checked-in golden images still contain yearly presentation.

- [ ] **Step 2: Regenerate screenshot references with the project’s configured update task**

First list screenshot tasks:

```bash
cd Astroloji
./gradlew :app:tasks --all | grep -i screenshot
```

Run the existing reference-update task shown by Gradle, expected to be the plugin’s `updateDebugScreenshotTest`-style task. Do not hand-edit PNG files.

- [ ] **Step 3: Validate fresh goldens**

Run:

```bash
cd Astroloji
./gradlew :app:validateDebugScreenshotTest
```

Expected: PASS. Inspect generated images to confirm monthly appears first with `Recommended` / `Önerilen`, weekly appears second, and no yearly text is visible.

- [ ] **Step 4: Commit screenshot fixtures and references**

```bash
git add Astroloji/app/src/screenshotTest
git commit -m "test(android): update weekly monthly paywall goldens"
```

---

### Task 7: Internal Release Version Floor

**Files:**
- Modify: `scripts/check-play-release-access.mjs`
- Modify: `scripts/check-play-release-access.test.mjs`
- Modify: `.github/workflows/android-internal-preflight.yml`
- Modify: `.github/workflows/android-internal-release.yml`

**Interfaces:**
- Produces:
  - `export function resolveRequiredVersionCode(playMaxVersionCode, minimumVersionCode = 1)`
  - workflow output `recommended_version_code` equal to `max(playMaxVersionCode + 1, minimumVersionCode)`.
- Consumes: `MINIMUM_INTERNAL_VERSION_CODE=1101` in internal workflows.

- [ ] **Step 1: Add failing version-floor tests**

Add:

```js
test('internal version recommendation respects the sideload floor', () => {
  assert.equal(resolveRequiredVersionCode(22, 1101), 1101);
});

test('internal version recommendation still advances beyond a higher Play code', () => {
  assert.equal(resolveRequiredVersionCode(1200, 1101), 1201);
});
```

Add input validation coverage that rejects a requested release version below the computed requirement.

- [ ] **Step 2: Run release-tool tests and verify red state**

Run:

```bash
node --test scripts/check-play-release-access.test.mjs
```

Expected: FAIL because `resolveRequiredVersionCode` is absent and current recommendation is only Play max + 1.

- [ ] **Step 3: Implement required-version calculation and workflow guards**

Implement:

```js
export function resolveRequiredVersionCode(playMaxVersionCode, minimumVersionCode = 1) {
  const nextPlayVersion = Number(playMaxVersionCode) + 1;
  const floor = Number(minimumVersionCode);
  const result = Math.max(nextPlayVersion, floor);
  if (!Number.isSafeInteger(result) || result <= 0 || result > MAX_PLAY_VERSION_CODE) {
    throw new Error('No valid Google Play version code remains.');
  }
  return result;
}
```

Read `MINIMUM_INTERNAL_VERSION_CODE` in `main()` and pass it to the access check. In both internal workflows set:

```yaml
MINIMUM_INTERNAL_VERSION_CODE: "1101"
```

Before bundle/publish, compare `${{ inputs.version_code }}` numerically with `${{ steps.play_access.outputs.recommended_version_code }}` and fail with a clear message when lower. Do not auto-publish or rewrite a user-provided version.

- [ ] **Step 4: Run all root tooling tests and secret scan**

Run:

```bash
node scripts/scan-secrets.mjs
node --test scripts/*.test.mjs
```

Expected: secret scan passes and all root tests pass.

- [ ] **Step 5: Commit release guard**

```bash
git add scripts/check-play-release-access.mjs scripts/check-play-release-access.test.mjs \
  .github/workflows/android-internal-preflight.yml .github/workflows/android-internal-release.yml
git commit -m "fix(release): require internal version code 1101 or newer"
```

---

### Task 8: Full Verification, Play Read-Back, and Review Handoff

**Files:**
- Verify all modified files.
- Create: `docs/superpowers/verification/2026-08-06-weekly-monthly-subscriptions.md`

**Interfaces:**
- Consumes: all previous task outputs.
- Produces: reproducible verification evidence and a review-ready feature branch; no deployment.

- [ ] **Step 1: Prove yearly production references are gone**

Run:

```bash
git grep -nE 'premium_yearly|PremiumBillingCadence\.YEARLY|premium_yearly_label|premium_yearly_savings_percent|premium_period_yearly' -- \
  ':!docs/superpowers/specs/**' ':!docs/superpowers/plans/**'
```

Expected: no matches. Historical design/plan prose may mention the removed identifier and is excluded.

- [ ] **Step 2: Run complete backend verification**

Run:

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

Expected: zero audit findings at the configured threshold and all tests/builds exit `0`.

- [ ] **Step 3: Run complete Android verification**

Prepare local-only CI settings and placeholder Firebase config exactly as CI does, then run:

```bash
cd Astroloji
./gradlew :app:detekt
./gradlew :app:ktlintCheck
./gradlew :app:lintDebug
./gradlew :app:validateDebugScreenshotTest
./gradlew :app:testDebugUnitTest
./gradlew :device-smoke:assembleDebug :device-smoke:assembleDebugAndroidTest
./gradlew :app:assembleDebug
ADMOB_APP_ID='ca-app-pub-3940256099942544~3347511713' \
ADMOB_BANNER_ID='ca-app-pub-3940256099942544/9214589741' \
ADMOB_INTERSTITIAL_ID='ca-app-pub-3940256099942544/1033173712' \
ADMOB_REWARDED_ID='ca-app-pub-3940256099942544/5224354917' \
ADMOB_REWARDED_INTERSTITIAL_ID='ca-app-pub-3940256099942544/5354046379' \
ADMOB_APP_OPEN_ID='ca-app-pub-3940256099942544/9257395921' \
ADMOB_NATIVE_ADVANCED_ID='ca-app-pub-3940256099942544/2247696110' \
./gradlew :app:bundleRelease
```

Expected: every Gradle invocation exits `0`; lint has zero issues; debug APK, smoke APKs, and release AAB exist.

- [ ] **Step 4: Read back Play products without mutation**

Use Doppler’s `PLAY_SERVICE_ACCOUNT_JSON` and Android Publisher API to list subscriptions. Record only:

```text
premium_monthly / monthly / P1M / ACTIVE
premium_weekly / weekly / P1W / ACTIVE
```

Also record regional availability counts and offer counts, but do not print credentials or access tokens.

- [ ] **Step 5: Write verification evidence**

Create the verification document with:

- branch and commit SHA;
- exact commands and exit codes;
- backend/root/Android test counts;
- lint issue count;
- artefact paths and byte sizes;
- Play product read-back summary;
- explicit statement that no Play publish, production deploy, or purchase was performed;
- remaining gated actions: PR review, merge, signed internal `1101+` publish, Play install, license-tester test purchase, backend verify/restore/RTDN evidence.

- [ ] **Step 6: Commit verification evidence**

```bash
git add docs/superpowers/verification/2026-08-06-weekly-monthly-subscriptions.md
git commit -m "docs: record subscription verification evidence"
```

- [ ] **Step 7: Push branch and open a pull request after fresh verification**

Run:

```bash
git status --short --branch
git log --oneline origin/main..HEAD
git push -u origin fix/weekly-monthly-subscriptions-20260806
gh pr create \
  --base main \
  --head fix/weekly-monthly-subscriptions-20260806 \
  --title "fix: support weekly and monthly subscriptions" \
  --body-file docs/superpowers/verification/2026-08-06-weekly-monthly-subscriptions.md
```

Expected: clean worktree before push, branch pushed, and PR URL returned. Do not merge until GitHub CI is green and review findings are resolved.

---

## Post-Merge Gated Acceptance

These actions are deliberately not part of branch implementation and require explicit execution approval at the time they are performed:

1. Run `android-internal-preflight` with version code `1101` or the workflow’s higher recommendation.
2. Publish the signed AAB to the Play internal track.
3. Add/confirm the Redmi Google account as an internal tester and license tester.
4. Remove or safely migrate the sideload `versionCode=1100` package so the app is installed through Play.
5. Confirm BillingClient returns both products and the UI displays both localized prices.
6. Launch a Google Play test purchase using the test payment method; no real charge.
7. Confirm backend `/subscriptions/verify`, purchase acknowledgement, D1 premium state, restore, and RTDN lifecycle evidence.
8. Record cancellation, grace-period, account-hold, and expiration tests without changing production rollout status.
