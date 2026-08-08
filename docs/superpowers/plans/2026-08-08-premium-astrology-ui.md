# Premium Astrology UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the existing Jetpack Compose application into the approved premium midnight-blue, cosmic-purple, and warm-gold visual system without changing backend, billing, navigation, or domain behavior.

**Architecture:** Introduce a small reusable premium design-system layer on top of Material 3, then migrate screens in vertical slices. Existing ViewModels, state models, navigation routes, analytics, billing catalogue state, and API calls remain authoritative; composables only reshape presentation.

**Tech Stack:** Kotlin, Jetpack Compose Material 3, AndroidX Navigation Compose, Hilt, Compose Screenshot Testing, JUnit, Gradle, Detekt, ktlint.

## Global Constraints

- Preserve all backend request/response contracts and production behavior.
- Preserve actual monthly/weekly Premium catalogue state and prices; never invent discounts, prices, scores, or benefits not present in app state/resources.
- Keep the current navigation graph and deep-link behavior intact.
- Maintain Material touch targets, readable contrast, dynamic text support, and semantic labels.
- The premium dark theme is the primary experience; keep the light theme functional and visually coherent.
- Do not add production backend migrations, new remote dependencies, or network-delivered artwork.
- Prefer vector/Compose-drawn celestial decoration over raster-heavy assets.

---

## File Structure

- `ui/theme/Color.kt`: premium semantic palette primitives.
- `ui/theme/Theme.kt`: dark/light Material color schemes and theme defaults.
- `ui/theme/Type.kt`: premium serif/sans hierarchy using bundled/system fonts only.
- `core/ui/components/PremiumComponents.kt`: reusable glass cards, hero surfaces, metric rings, gold CTA, icon tiles, section headers.
- `core/ui/components/CommonComponents.kt`: existing shared components restyled to delegate to premium primitives where appropriate.
- `navigation/AstrologyAppRoot.kt`: premium bottom navigation/scaffold chrome only; routes remain unchanged.
- Feature `*Screen.kt` files: presentation refactors only.
- `src/screenshotTest/...`: deterministic visual regression coverage for design-system and key premium surfaces.
### Task 1: Premium design-system foundation

**Files:**
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/ui/theme/Color.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/ui/theme/Theme.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/ui/theme/Type.kt`
- Create: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/ui/components/PremiumComponents.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/ui/components/CommonComponents.kt`
- Create: `Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/core/ui/PremiumDesignSystemScreenshotTest.kt`

**Interfaces:**
- Produces: `PremiumGlassCard`, `PremiumHeroCard`, `PremiumSectionHeader`, `PremiumMetricRing`, `PremiumIconTile`, `PremiumGoldButton`, `PremiumPill` composables.
- Produces: semantic colors `Midnight900`, `Midnight800`, `CosmicPurple`, `CosmicViolet`, `WarmGold`, `SoftGold`, `Starlight`.

- [ ] **Step 1: Write the failing screenshot previews**

Create previews that render a hero card, glass card, metric ring, icon tile, and CTA inside `AstrolojiTheme(darkTheme = true)` and reference the new composable names. This must fail compilation before the components exist.

- [ ] **Step 2: Run the focused screenshot compile**

Run: `cd Astroloji && ./gradlew :app:validateDebugScreenshotTest -Pandroid.experimental.enableScreenshotTest=true -Pandroid.sync.suppressAgpWarnings=UNSUPPORTED_PROJECT_OPTION_USE`
Expected: FAIL because the premium composables/palette are unresolved.

- [ ] **Step 3: Implement palette, typography, and primitives**

Use a dark scheme centered on `#070B1D` / `#10162D`, controlled purple glows, warm gold `#D9B66F`, and off-white `#F7F2E8`. `PremiumGlassCard` must use a 24dp rounded shape, translucent surface, 1dp low-alpha border, and 20dp content padding. `PremiumGoldButton` must keep at least 48dp height and high-contrast dark text. `PremiumMetricRing` must consume a real `0..100` value and never fabricate one.

- [ ] **Step 4: Make existing shared components inherit the new visual language**

Update `AstrologyCard`, `CosmicBackground`, `AstroSectionTitle`, `DetailChip`, and `ZodiacChip` to use the premium palette/primitives while preserving their public signatures.

- [ ] **Step 5: Run screenshot + static checks**

Run: `cd Astroloji && ./gradlew :app:validateDebugScreenshotTest detekt ktlintCheck -Pandroid.experimental.enableScreenshotTest=true -Pandroid.sync.suppressAgpWarnings=UNSUPPORTED_PROJECT_OPTION_USE`
Expected: PASS.

- [ ] **Step 6: Commit**

`git add Astroloji/app/src/main/java/com/parsfilo/astrology/ui/theme Astroloji/app/src/main/java/com/parsfilo/astrology/core/ui/components Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/core/ui && git commit -m "feat(android): add premium astrology design system"`

### Task 2: Premium application chrome and navigation

**Files:**
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/navigation/AstrologyAppRoot.kt`
- Create: `Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/navigation/PremiumNavigationScreenshotTest.kt`

**Interfaces:**
- Consumes: Task 1 premium palette and glass surfaces.
- Preserves: all existing `Routes`, deep links, selected-route logic, and navigation callbacks.
- [ ] **Step 1: Add a failing premium navigation screenshot preview**

Create a deterministic preview of the scaffold chrome with three representative navigation items and assert visually that the selected item uses gold emphasis while unselected items remain muted. Keep labels readable and icons at standard Material sizes.

- [ ] **Step 2: Run focused screenshot validation**

Run the screenshot validation task and confirm the new preview does not yet match/compile against the desired chrome.

- [ ] **Step 3: Restyle the existing `Scaffold` bottom bar**

Keep the same route list and click handlers. Replace flat navigation styling with a dark translucent navigation surface, restrained top border/glow, rounded selected indicator, warm-gold selected icon/label, and high-contrast unselected content. Do not add destinations or change route order.

- [ ] **Step 4: Verify navigation behavior and screenshot tests**

Run: `cd Astroloji && ./gradlew :app:testDebugUnitTest :app:validateDebugScreenshotTest -Pandroid.experimental.enableScreenshotTest=true -Pandroid.sync.suppressAgpWarnings=UNSUPPORTED_PROJECT_OPTION_USE`
Expected: PASS with existing navigation behavior intact.

- [ ] **Step 5: Commit**

`git add Astroloji/app/src/main/java/com/parsfilo/astrology/navigation/AstrologyAppRoot.kt Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/navigation && git commit -m "feat(android): refine premium navigation chrome"`

### Task 3: Redesign Home as the premium dashboard

**Files:**
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/home/HomeScreen.kt`
- Create: `Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/feature/home/HomePremiumScreenshotTest.kt`
- Test existing: `Astroloji/app/src/test/java/com/parsfilo/astrology/feature/home/HomeViewModelTest.kt`

**Interfaces:**
- Consumes: existing `HomeUiState`, `ZodiacSign`, moon phase, daily insight, streak, subscription warning, and navigation callbacks.
- Produces presentation only; no ViewModel event or repository signature changes.

- [ ] **Step 1: Add deterministic Home screenshot fixture**

Render a representative state with one zodiac sign, a daily result, streak, and non-warning subscription state. The preview must cover hero, quick-access row, metrics, lucky details, and daily commentary without network/Hilt dependencies.

- [ ] **Step 2: Run screenshot validation and capture RED**

Run focused screenshot validation. Expected: the existing layout does not satisfy the new golden/premium snapshot.

- [ ] **Step 3: Build the zodiac hero and quick-access hierarchy**

Replace the current greeting-first layout with: compact brand/eyebrow, zodiac hero card using the real selected sign/name/date range, date/streak secondary row, and premium icon tiles for Daily/Weekly/Monthly/Personality plus existing accessible navigation callbacks. Do not invent a compatibility callback if the current Home API does not expose one.

- [ ] **Step 4: Recompose daily metrics and commentary**

Use `PremiumMetricRing` for the real energy value, slim metric bars/cards for real love/money/career/health values, premium pills for lucky number/color, and a larger editorial commentary card. Keep subscription grace/on-hold warning and ad placement behavior intact.

- [ ] **Step 5: Verify state behavior and visual regression**

Run: `cd Astroloji && ./gradlew :app:testDebugUnitTest --tests '*HomeViewModelTest' :app:validateDebugScreenshotTest -Pandroid.experimental.enableScreenshotTest=true -Pandroid.sync.suppressAgpWarnings=UNSUPPORTED_PROJECT_OPTION_USE`
Expected: PASS.

- [ ] **Step 6: Commit**

`git add Astroloji/app/src/main/java/com/parsfilo/astrology/feature/home/HomeScreen.kt Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/feature/home && git commit -m "feat(android): redesign home as premium dashboard"`

### Task 4: Redesign Daily and Compatibility detail surfaces

**Files:**
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/daily/DailyScreen.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/compatibility/CompatibilityScreen.kt`
- Create: `Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/feature/daily/DailyPremiumScreenshotTest.kt`
- Create: `Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/feature/compatibility/CompatibilityPremiumScreenshotTest.kt`
- Test existing: `DailyViewModelTest.kt`, `CompatibilityViewModelTest.kt`, `CompatibilityScorePresentationTest.kt`
**Interfaces:**
- Daily consumes only existing horoscope fields and premium-lock state.
- Compatibility consumes only existing selected signs, score/result, and ViewModel events.

- [ ] **Step 1: Add failing deterministic screenshot fixtures**

Daily fixture: selected sign, date, actual energy/love/career/money/health/lucky values, commentary sections, and a representative premium-lock state. Compatibility fixture: two signs plus the existing computed score/result.

- [ ] **Step 2: Run screenshot validation and capture RED**

Run the screenshot validation task; expected result is mismatch/failure before the redesign.

- [ ] **Step 3: Redesign Daily**

Create a compact sign header/hero, real metric rings/bars, lucky-detail pills, and editorial content cards. Preserve premium locked blocks, feedback actions, share behavior, retry/loading/error behavior, and every existing data field.

- [ ] **Step 4: Redesign Compatibility**

Center the two real sign bubbles around the real compatibility score; use a premium score card with real labels and retain all existing selectors, premium gating, details, and callbacks. No fabricated compatibility copy or score is permitted.

- [ ] **Step 5: Run focused unit + screenshot suite**

Run: `cd Astroloji && ./gradlew :app:testDebugUnitTest --tests '*DailyViewModelTest' --tests '*CompatibilityViewModelTest' --tests '*CompatibilityScorePresentationTest' :app:validateDebugScreenshotTest -Pandroid.experimental.enableScreenshotTest=true -Pandroid.sync.suppressAgpWarnings=UNSUPPORTED_PROJECT_OPTION_USE`
Expected: PASS.

- [ ] **Step 6: Commit**

`git add Astroloji/app/src/main/java/com/parsfilo/astrology/feature/daily Astroloji/app/src/main/java/com/parsfilo/astrology/feature/compatibility Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/feature/daily Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/feature/compatibility && git commit -m "feat(android): elevate horoscope detail surfaces"`
### Task 5: Redesign Premium and Settings conversion surfaces

**Files:**
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium/PremiumScreen.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/settings/SettingsScreen.kt`
- Modify: `Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/feature/premium/PremiumOfferScreenshotTest.kt`
- Create: `Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/feature/settings/SettingsPremiumScreenshotTest.kt`
- Test existing: `PremiumOfferPresentationTest.kt`, `PremiumViewModelTest.kt`, `StoreScreenshotQaBillingTest.kt`, `SettingsViewModelTest.kt`

**Interfaces:**
- Premium consumes the actual `PremiumUiState`, available monthly/weekly plans, selected plan, billing errors, purchase/restore callbacks, and QA state.
- Settings consumes existing preference/profile state and callbacks only.

- [ ] **Step 1: Update/add screenshot fixtures before implementation**

Premium fixture must include real representative monthly/weekly plan objects already used by screenshot QA. Settings fixture must cover notification controls and profile/preference sections with deterministic state.

- [ ] **Step 2: Run screenshot validation and capture RED**

Run the screenshot validation task. Expected: mismatch before redesign.

- [ ] **Step 3: Redesign Premium around benefits + real plan selection**

Use a premium crown/hero treatment, concise benefit rows derived from existing app capabilities/resources, strong selected-plan card hierarchy, and `PremiumGoldButton` for purchase. Keep actual formatted prices, monthly/weekly cadence, restore flow, loading/error states, cancellation semantics, and store-QA behavior unchanged.

- [ ] **Step 4: Redesign Settings into premium grouped controls**

Use glass sections, premium segment rows, restrained dividers, and high-contrast controls. Preserve every current preference, account deletion flow, legal/about row, notification behavior, and accessibility semantics.
- [ ] **Step 5: Run focused billing/settings + screenshot suite**

Run: `cd Astroloji && ./gradlew :app:testDebugUnitTest --tests '*PremiumOfferPresentationTest' --tests '*PremiumViewModelTest' --tests '*StoreScreenshotQaBillingTest' --tests '*SettingsViewModelTest' :app:validateDebugScreenshotTest -Pandroid.experimental.enableScreenshotTest=true -Pandroid.sync.suppressAgpWarnings=UNSUPPORTED_PROJECT_OPTION_USE`
Expected: PASS.

- [ ] **Step 6: Commit**

`git add Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium Astroloji/app/src/main/java/com/parsfilo/astrology/feature/settings Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/feature/premium Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/feature/settings && git commit -m "feat(android): polish premium and settings surfaces"`

### Task 6: Propagate the premium system across secondary content screens

**Files:**
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/weekly/WeeklyScreen.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/monthly/MonthlyScreen.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/personality/PersonalityScreen.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/chart/PersonalGuidanceScreen.kt`
- Modify only if required for consistency: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/onboarding/OnboardingScreen.kt`
- Modify existing store screenshot fixtures only where the app UI itself is rendered.

**Interfaces:**
- Consume Task 1 shared premium components.
- Preserve all feature ViewModels, premium gating, ads, retry/error states, analytics, and navigation callbacks.

- [ ] **Step 1: Add/extend deterministic visual coverage for one representative secondary content screen**

Use the existing screenshot infrastructure to render representative weekly/monthly/personality content with premium cards and verify large-text-safe vertical scrolling.

- [ ] **Step 2: Run screenshot validation and record RED**

Expected: old secondary presentation differs from the premium system.
- [ ] **Step 3: Migrate secondary screens to shared premium primitives**

Replace flat cards/headers with `PremiumGlassCard`, `PremiumSectionHeader`, premium pills, and the upgraded `CosmicBackground`. Keep content density lower than Home and avoid decorative duplication. Onboarding changes are limited to palette/cards/buttons if its current structure already works.

- [ ] **Step 4: Verify feature unit tests and screenshot regression**

Run: `cd Astroloji && ./gradlew :app:testDebugUnitTest :app:validateDebugScreenshotTest -Pandroid.experimental.enableScreenshotTest=true -Pandroid.sync.suppressAgpWarnings=UNSUPPORTED_PROJECT_OPTION_USE`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add Astroloji/app/src/main/java/com/parsfilo/astrology/feature Astroloji/app/src/screenshotTest && git commit -m "feat(android): unify premium content presentation"`

### Task 7: Full quality, accessibility, and release verification

**Files:**
- Modify only files required to fix regressions found by the gates below.
- Do not broaden scope into backend or feature behavior changes.

**Interfaces:**
- Validates all prior tasks as one coherent application.

- [ ] **Step 1: Run formatting and static analysis**

Run: `cd Astroloji && ./gradlew detekt ktlintCheck lintDebug`
Expected: PASS with no new warnings attributable to the redesign.

- [ ] **Step 2: Run all JVM tests**

Run: `cd Astroloji && ./gradlew :app:testDebugUnitTest`
Expected: PASS.

- [ ] **Step 3: Run all Compose screenshot tests**

Run: `cd Astroloji && ./gradlew :app:validateDebugScreenshotTest -Pandroid.experimental.enableScreenshotTest=true -Pandroid.sync.suppressAgpWarnings=UNSUPPORTED_PROJECT_OPTION_USE`
Expected: PASS with approved premium goldens.

- [ ] **Step 4: Build installable/release artifacts**

Run: `cd Astroloji && ./gradlew :app:assembleDebug :app:bundleRelease`
Expected: PASS.

- [ ] **Step 5: Run repository diff and behavior-scope audit**

Run: `git diff --check && git status --short && git diff --name-only e49d27796e56f5ad8673b278bed59231b1024e06...HEAD`
Expected: clean diff-check; changes limited to design spec/plan, Android theme/components/screens/tests/resources needed by the redesign; no backend files.

- [ ] **Step 6: Commit any gate-only fixes**

If Step 1-5 required fixes, commit them as `fix(android): close premium UI verification gaps`. If no fixes were needed, do not create an empty commit.

- [ ] **Step 7: Fresh final verification**

Re-run `detekt ktlintCheck lintDebug :app:testDebugUnitTest :app:validateDebugScreenshotTest :app:assembleDebug :app:bundleRelease` from the final immutable head and record the exact commit SHA and successful outputs before opening a PR.
