# Global Google Play Store Optimization Design

**Date:** 2026-08-06  
**Package:** `com.parsfilo.astrology`  
**Branch:** `feat/global-play-store-optimization-20260806`  
**Owner:** MakerParsDev / ParsFilo

## 1. Objective

Make the Google Play presence honest, globally credible, conversion-oriented, measurable, and reproducible from source control.

The current application supports Turkish and English. The first optimization phase therefore serves exactly those two languages. A locale may be added later only when the application UI, product content, store text, screenshots, support path, and QA evidence are all available in that locale.

The desired metadata-publication rollout contract is 10%, but live production release `1102` was observed on 2026-08-07 as `completed` / 100%. Policy, metadata, asset publication, and locale cleanup must not change that live track and remain blocked until a separate release/rollout decision establishes an approved rollout state. Rollout changes are separate operational decisions based on stability and conversion evidence.

## 2. Non-goals

This phase does not:

- claim support for languages not shipped by the Android application,
- retain low-quality machine-translated listings for unsupported locales,
- add new Android application languages,
- create misleading testimonials, ratings, medical claims, guaranteed predictions, or scarcity claims,
- change subscription prices or production billing products,
- mutate the current production rollout (currently 100%) or manufacture a 10% state merely to satisfy metadata guards,
- publish metadata without a backup, dry-run report, explicit diff, and post-publish read-back.

## 3. Guiding principles

1. **Product promise equals shipped experience.** Store locale, application locale, screenshots, support, and policy statements must agree.
2. **Quality beats locale count.** Two complete locales are preferable to 86 incomplete or machine-generated locales.
3. **Policy truth before marketing polish.** Data Safety, account deletion, privacy policy, ads, analytics, and billing declarations must match the shipped artifact.
4. **Source control is canonical.** Store text, release notes, asset manifests, checksums, and publication logic live in the repository.
5. **Every mutation is reversible or reconstructible.** The live listing is backed up before edits; publication logs record before/after state without secrets.
6. **No unsupported claims.** Copy describes features that exist in the production artifact and avoids certainty about astrology outcomes.
7. **Measure before expanding.** Rollout and future locales depend on conversion, retention, rating, crash, ANR, and subscription evidence.

## 4. Scope decomposition

The work is divided into five independently testable workstreams.

### 4.1 Policy and trust reconciliation

Create a Play Console operator checklist derived from `docs/DATA_SAFETY_2026.md` and the exact production artifact.

Required outcomes:

- Account deletion is declared as supported.
- The public deletion URL is `https://astrology.parsfilo.com/delete-account`.
- Privacy policy, website, developer identity, and support email use one approved ParsFilo identity.
- Data Safety answers cover Firebase Authentication, Analytics, Crashlytics, FCM, Remote Config, Google Mobile Ads/UMP, Google Play Billing, Cloudflare processing, optional birth date processing, account-linked records, and deletion behavior.
- Ads declaration, target audience, app access, content rating, subscription disclosure, and data collection purposes are rechecked against the production artifact.
- The public Play page must no longer state that data cannot be deleted when account deletion is available.

Play Console fields that cannot be safely modified through the Android Publisher API are handled through a bounded browser task. The task is read-only first, produces an exact proposed answer set, and requires a separate state-bound approval before any save or submission action.

### 4.2 Turkish and English ASO copy

The repository contains canonical metadata for `tr-TR` and `en-US` only.

Each locale includes:

- title, maximum 30 characters,
- short description, maximum 80 characters,
- full description, maximum 4,000 characters,
- release notes, maximum 500 characters,
- support identity and locale-specific keyword intent documentation.

Copy strategy:

- Lead with the daily-use benefit rather than a generic brand statement.
- Cover daily horoscope, weekly/monthly guidance, compatibility, personality insights, widgets, notifications, shareable cards, and premium benefits only where shipped.
- Use natural language rather than keyword lists.
- Avoid words implying medical, financial, legal, psychological, or guaranteed predictive authority.
- Avoid claiming free trials or annual plans that do not exist.
- Use correct Turkish characters and professionally edited English.

The validator will enforce length, Unicode quality, banned claims, duplicate-language detection, unsupported locale prevention, and consistency with the Android locale configuration.

### 4.3 Localized visual asset system

Create a reproducible store asset source and export structure:

```text
Astroloji/play/
  assets/
    source/
    tr-TR/
      icon/
      featureGraphic/
      phoneScreenshots/
    en-US/
      icon/
      featureGraphic/
      phoneScreenshots/
  asset-manifest.json
```

The application icon remains brand-consistent and is not duplicated per locale unless the visual itself differs. Feature graphics and screenshots are localized.

The initial screenshot narrative contains six phone screenshots per locale:

1. Personalized daily horoscope and energy overview.
2. Weekly and monthly guidance.
3. Love, friendship, and work compatibility.
4. Sign personality and deeper premium insights.
5. Widgets, notifications, and shareable cards.
6. Monthly and weekly premium choices with an honest benefit summary.

Visual rules:

- Use real application screens or deterministic screenshot fixtures.
- Do not fabricate ratings, user counts, awards, endorsements, or unavailable features.
- Text remains readable on common Play surfaces.
- Turkish and English images contain only their own locale.
- Device frames, gradients, decorative zodiac elements, and marketing headlines may be added outside the captured application UI without altering the represented product behavior.
- All exports meet current Play image dimensions and file constraints.
- The first three screenshots communicate the core value without requiring scrolling.

A feature graphic is produced for each locale using the same visual system. The graphic communicates the brand and core value without small UI text or unsupported promotional claims.

### 4.4 Metadata and asset publication automation

Extend the metadata tooling so that it can:

1. Fetch and store a secret-safe backup of current listings and asset metadata.
2. Compare Play locales with Android-supported locales.
3. Refuse publication when an unsupported locale exists in the proposed source set.
4. Detect duplicate or fallback English copy incorrectly assigned to another locale.
5. Validate text limits, required files, image dimensions, file types, screenshot counts, and manifest checksums.
6. Produce a human-readable dry-run diff.
7. Upload text and images for `tr-TR` and `en-US`.
8. Delete unsupported live listing locales only when an explicit destructive confirmation is supplied.
9. Commit the Play edit and perform an independent read-back.
10. Keep `ENABLE_METADATA_PUBLISH=false` except during the approved publication window, then restore it to `false`.

The destructive locale cleanup is separated from text/image publication. It requires:

- a complete live backup,
- an allowlist containing only `tr-TR` and `en-US`,
- an exact count of locales to be removed,
- a dry-run report,
- explicit approval bound to the current Play state,
- post-commit verification that the two supported locales remain intact.

### 4.5 Measurement and rollout governance

Establish a baseline before publication and a comparison window after publication.

Track, where available:

- store listing visitors,
- first-time installers,
- visitor-to-installer conversion by country and locale,
- uninstall or retained-installer indicators,
- rating and review volume,
- crash and ANR rates,
- active users and engagement,
- premium screen views,
- subscription purchase starts and verified purchases,
- ad request-to-impression behavior.

No metric is used to claim causation without an experiment. Metadata and visual changes are recorded with timestamps so conversion changes can be interpreted.

Future language expansion criteria:

- sufficient traffic or strategic market value,
- complete Android UI translation,
- content and notification localization,
- professionally reviewed store copy,
- six localized screenshots and feature graphic,
- locale QA on a real device,
- support capability for that language,
- stable crash/ANR and acceptable conversion after release.

## 5. Store copy positioning

### Turkish positioning

The Turkish listing prioritizes a polished daily astrology routine, personalized sign content, compatibility, and practical widgets/notifications. Tone is warm, modern, clear, and non-deterministic.

### English positioning

The English listing targets a broad international audience with daily guidance, compatibility, weekly/monthly insights, and a clean habit-forming experience. Tone is natural international English, not literal translation from Turkish.

### Keyword intent

Keywords are incorporated naturally into sentences. The primary concepts are:

- Turkish: astroloji, günlük burç yorumu, burçlar, aşk uyumu, haftalık burç, aylık burç.
- English: astrology, daily horoscope, zodiac signs, compatibility, weekly horoscope, monthly horoscope.

No title or description is constructed as a keyword chain.

## 6. Error handling and rollback

### Publication failures

- An edit that fails validation is not committed.
- A partial upload is abandoned unless all required locale text and assets are confirmed.
- Credentials are stored only in temporary files with restrictive permissions and are deleted by a trap.
- Logs never print access tokens, service-account JSON, tester identities, or private keys.

### Live listing rollback

The pre-change backup is sufficient to reconstruct every removed listing and asset reference. A rollback command recreates the previous two supported listings or the full backed-up locale set, depending on the approved recovery target.

### Policy form failures

Data Safety and other UI-only forms are not submitted if the answer set cannot be reconciled with the engineering matrix. Browser automation stops before submission when the page structure, current answers, or approval digest has changed.

## 7. Testing strategy

### Repository tests

- Metadata length and banned-claim tests.
- Turkish Unicode and English-language quality checks.
- Android locale to Play locale contract tests.
- Duplicate translation and fallback-English detection.
- Asset dimension, format, count, locale, and checksum tests.
- Dry-run diff snapshots.
- Unsupported-locale deletion guard tests.
- Backup and restore serialization tests.
- Secret scan and workflow contract tests.

### Visual QA

- Side-by-side Turkish and English review of all six screenshots and feature graphics.
- Verify screenshots correspond to current production UI.
- Verify premium screenshots show monthly and weekly plans only.
- Verify no personal data, test identifiers, debug banners, or device notifications appear.
- Verify text remains legible at Play thumbnail sizes.

### Play read-back

After publication:

- exactly `tr-TR` and `en-US` listings exist,
- both listings match repository text byte-for-byte after normalization,
- both locales have the required visual assets,
- production track and rollout fraction are unchanged,
- subscription catalog is unchanged,
- metadata publication gate is returned to `false`.

## 8. Delivery sequence

1. Create and approve this design.
2. Write the implementation plan.
3. Implement validators, backup, dry-run, asset manifest, and workflow guards with TDD.
4. Rewrite and professionally review Turkish and English metadata.
5. Produce deterministic screenshot sources and localized marketing assets.
6. Run full repository and visual QA.
7. Back up the live Play listing.
8. Publish Turkish and English text/images in a bounded metadata edit.
9. Read back and verify.
10. Prepare and approve the destructive removal plan for unsupported locales.
11. Remove unsupported live locales and verify exactly two remain.
12. Reconcile UI-only policy fields through a bounded Play Console session.
13. Capture post-change baselines without mutating rollout. A future/staged release may use the desired 10% cap only after a separate rollout approval.

## 9. Acceptance criteria

The phase is complete when all of the following are true:

- The Android application and Play listing support the same two locales: Turkish and English.
- Live Play text matches canonical repository files.
- Turkish copy uses correct Turkish characters and English copy reads naturally.
- Six localized phone screenshots and one localized feature graphic exist for each locale.
- No unsupported locale remains active in the live listing.
- Data Safety and account deletion statements match actual application behavior.
- Support identity and policy URLs are consistent.
- Publication tooling has backup, dry-run, destructive confirmation, read-back, and rollback coverage.
- Full CI, metadata tests, visual QA, secret scan, and Play read-back pass.
- Metadata tooling leaves production rollout untouched. Live production is currently 100%; the desired 10% contract may be established only through a separate release/rollout decision.
