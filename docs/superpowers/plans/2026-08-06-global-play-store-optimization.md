# Global Google Play Store Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Google Play presence for `com.parsfilo.astrology` truthful, professionally localized in Turkish and English, visually conversion-oriented, reproducible from source control, and safely publishable with backup, dry-run, rollback, and read-back controls.

**Architecture:** Treat the Android locale configuration as the source of truth for supported store locales, and keep canonical text/assets under `Astroloji/play`. Build pure Node.js modules for validation, Play API backup/diff/publication, and destructive locale cleanup; keep mutation entry points thin and environment-gated. Generate deterministic localized store scenes from real Compose production components, export Play-compliant images from checked-in sources, and require policy fields that are UI-only to pass through a state-bound browser approval flow.

**Tech Stack:** Node.js 24 built-in modules and `node:test`, Kotlin/Jetpack Compose, Android Compose Screenshot plugin, Gradle 9.6.1, Google Android Publisher API v3, GitHub Actions, Doppler, Google Play Console browser automation.

## Global Constraints

- The application and canonical Play source support exactly `tr-TR` and `en-US` in this phase.
- Production rollout remains exactly `0.1` (10%) throughout this plan.
- Do not add a new Android application language.
- Do not change subscription prices, product IDs, base plans, or billing behavior.
- Do not claim trials, annual plans, guaranteed predictions, medical authority, financial authority, legal authority, ratings, awards, endorsements, or user counts.
- Turkish copy must use correct Turkish characters; English copy must be natural international English rather than a literal translation.
- Every Play mutation requires a complete backup, a dry-run diff, explicit confirmation, and independent read-back.
- `ENABLE_METADATA_PUBLISH` and `ENABLE_PRODUCTION_RELEASE` must be `false` outside the approved mutation window.
- Credential files must use mode `0600`, remain outside the repository, and be removed by a shell trap.
- Logs must never print access tokens, service-account JSON, private keys, tester identities, purchase tokens, or complete user e-mail addresses.
- UI-only Play policy forms must not be saved or submitted when the current page state differs from the approved state digest.
- Production track version codes, rollout fraction, and the monthly/weekly subscription catalog must remain unchanged by metadata work.

---

## File Structure

### Canonical Play source

- `Astroloji/play/store-config.json` — supported locale allowlist, support identity, URLs, asset requirements, and rollout invariant.
- `Astroloji/play/listings/{tr-TR,en-US}/` — canonical title, short description, full description, and keyword-intent notes.
- `Astroloji/play/release-notes/{tr-TR,en-US}/default.txt` — canonical release notes.
- `Astroloji/play/assets/source/` — deterministic source screenshots and feature-graphic source descriptions.
- `Astroloji/play/assets/{tr-TR,en-US}/` — Play-ready icon, feature graphic, and six phone screenshots per locale.
- `Astroloji/play/asset-manifest.json` — dimensions, MIME type, role, locale, filename, and SHA-256 for every published asset.

### Reusable tooling

- `scripts/lib/play-store-config.mjs` — parses store config and Android locale configuration.
- `scripts/lib/play-metadata.mjs` — loads and normalizes listing text.
- `scripts/lib/play-assets.mjs` — reads PNG/JPEG dimensions and validates manifest/checksums.
- `scripts/lib/play-api-client.mjs` — authenticated Android Publisher API wrapper with dependency-injected `fetch`.
- `scripts/lib/play-backup.mjs` — serializes secret-safe live listing and asset metadata backups.
- `scripts/lib/play-diff.mjs` — deterministic human-readable and JSON diff generation.
- `scripts/lib/play-policy.mjs` — validates operator answer sets against the engineering Data Safety matrix.

### Commands and workflows

- `scripts/validate-play-metadata.mjs` — repository validation entry point.
- `scripts/backup-play-metadata.mjs` — read-only live backup entry point.
- `scripts/diff-play-metadata.mjs` — dry-run diff entry point.
- `scripts/publish-play-metadata.mjs` — text/image publication and post-commit read-back.
- `scripts/cleanup-play-locales.mjs` — destructive unsupported-locale cleanup with exact confirmation.
- `scripts/restore-play-metadata.mjs` — reconstructs listings/assets from a selected backup.
- `scripts/capture-play-baseline.mjs` — secret-safe pre/post publication measurement snapshot.
- `.github/workflows/android-metadata.yml` — validation, backup, diff, publication, cleanup, read-back, and gate restoration.

### Android visual fixtures

- `Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/store/StoreListingScreenshotTest.kt` — twelve localized deterministic previews.
- `Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/store/StoreScreenshotFixtures.kt` — fixed non-personal fixture data and callbacks.
- Focused `internal` content composables in feature files — dependency-free rendering surfaces reused by production screens and screenshot tests.

### Policy and operations

- `docs/PLAY_POLICY_ANSWER_SET_2026.md` — exact current Play Console answers and evidence links.
- `docs/PLAY_STORE_OPTIMIZATION_RUNBOOK.md` — backup, publish, cleanup, rollback, policy-browser, and rollout-hold procedure.
- `docs/PLAY_STORE_BASELINE_2026-08-06.json` — redacted baseline metrics with collection timestamps.

---

### Task 1: Canonical Store Locale Contract

**Files:**
- Create: `Astroloji/play/store-config.json`
- Create: `scripts/lib/play-store-config.mjs`
- Create: `scripts/play-store-config.test.mjs`
- Modify: `scripts/validate-play-metadata.mjs`
- Modify: `Astroloji/play/README.md`

**Interfaces:**
- Consumes: Android locale file `Astroloji/app/src/main/res/xml/locales_config.xml`.
- Produces: `loadStoreConfig(rootDir): StoreConfig`, `readAndroidLocales(rootDir): string[]`, and `assertLocaleContract(config, androidLocales): void`.

- [ ] **Step 1: Write failing locale-contract tests**

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertLocaleContract,
  readAndroidLocales,
} from './lib/play-store-config.mjs';

test('Android en/tr locales map exactly to en-US and tr-TR Play locales', () => {
  const android = readAndroidLocales(process.cwd());
  assert.deepEqual(android, ['en', 'tr']);
  assert.doesNotThrow(() => assertLocaleContract({ locales: ['en-US', 'tr-TR'] }, android));
});

test('unsupported Play locale is rejected', () => {
  assert.throws(
    () => assertLocaleContract({ locales: ['de-DE', 'en-US', 'tr-TR'] }, ['en', 'tr']),
    /Unsupported Play locale: de-DE/,
  );
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
node --test scripts/play-store-config.test.mjs
```

Expected: FAIL because `scripts/lib/play-store-config.mjs` does not exist.

- [ ] **Step 3: Add the canonical configuration**

Create `Astroloji/play/store-config.json`:

```json
{
  "packageName": "com.parsfilo.astrology",
  "locales": ["en-US", "tr-TR"],
  "androidLocaleMap": {
    "en": "en-US",
    "tr": "tr-TR"
  },
  "support": {
    "developer": "ParsFilo",
    "email": "info@parsfilo.com",
    "website": "https://astrology.parsfilo.com",
    "privacyPolicy": "https://astrology.parsfilo.com/privacy",
    "accountDeletion": "https://astrology.parsfilo.com/delete-account"
  },
  "assets": {
    "phoneScreenshotCount": 6,
    "featureGraphic": { "width": 1024, "height": 500 },
    "icon": { "width": 512, "height": 512 }
  },
  "productionRolloutFraction": 0.1
}
```

- [ ] **Step 4: Implement the locale parser and contract**

Implement `scripts/lib/play-store-config.mjs` with no third-party dependency:

```javascript
import fs from 'node:fs';
import path from 'node:path';

export function loadStoreConfig(rootDir) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, 'Astroloji/play/store-config.json'), 'utf8'));
}

export function readAndroidLocales(rootDir) {
  const xml = fs.readFileSync(
    path.join(rootDir, 'Astroloji/app/src/main/res/xml/locales_config.xml'),
    'utf8',
  );
  return [...xml.matchAll(/android:name="([^"]+)"/g)].map((match) => match[1]).sort();
}

export function assertLocaleContract(config, androidLocales) {
  const mapped = androidLocales.map((locale) => config.androidLocaleMap[locale]).sort();
  const proposed = [...config.locales].sort();
  const unsupported = proposed.filter((locale) => !mapped.includes(locale));
  const missing = mapped.filter((locale) => !proposed.includes(locale));
  if (unsupported.length) throw new Error(`Unsupported Play locale: ${unsupported.join(', ')}`);
  if (missing.length) throw new Error(`Missing Play locale: ${missing.join(', ')}`);
}
```

- [ ] **Step 5: Integrate the contract into metadata validation**

At the beginning of `scripts/validate-play-metadata.mjs`, load config, parse Android locales, and fail before text validation when the locale directory set differs from `config.locales`.

- [ ] **Step 6: Run focused tests and validator**

```bash
node --test scripts/play-store-config.test.mjs
node scripts/validate-play-metadata.mjs
```

Expected: both commands PASS and report exactly two supported locales.

- [ ] **Step 7: Commit**

```bash
git add Astroloji/play/store-config.json Astroloji/play/README.md scripts/lib/play-store-config.mjs scripts/play-store-config.test.mjs scripts/validate-play-metadata.mjs
git commit -m "feat(play): enforce Android and store locale contract"
```

---

### Task 2: Professional Turkish and English ASO Copy

**Files:**
- Modify: `Astroloji/play/listings/tr-TR/title.txt`
- Modify: `Astroloji/play/listings/tr-TR/short-description.txt`
- Modify: `Astroloji/play/listings/tr-TR/full-description.txt`
- Create: `Astroloji/play/listings/tr-TR/keyword-intent.md`
- Modify: `Astroloji/play/listings/en-US/title.txt`
- Modify: `Astroloji/play/listings/en-US/short-description.txt`
- Modify: `Astroloji/play/listings/en-US/full-description.txt`
- Create: `Astroloji/play/listings/en-US/keyword-intent.md`
- Modify: `Astroloji/play/release-notes/tr-TR/default.txt`
- Modify: `Astroloji/play/release-notes/en-US/default.txt`
- Create: `scripts/play-copy-quality.test.mjs`
- Modify: `scripts/validate-play-metadata.mjs`

**Interfaces:**
- Consumes: locale contract from Task 1.
- Produces: canonical normalized listing payloads accepted by the Play API.

- [ ] **Step 1: Write failing copy-quality tests**

Tests must assert:

```javascript
assert.match(trTitle, /[çğıöşüÇĞİÖŞÜ]/);
assert.match(trFull, /günlük burç yorumu/i);
assert.match(trFull, /haftalık/i);
assert.match(trFull, /aylık/i);
assert.match(trFull, /uyum/i);
assert.match(enFull, /daily horoscope/i);
assert.match(enFull, /weekly/i);
assert.match(enFull, /monthly/i);
assert.match(enFull, /compatibility/i);
assert.doesNotMatch(allCopy, /free trial|annual|yearly|guaranteed|accurate prediction/i);
assert.doesNotMatch(trFull, /\bGunluk\b|\bBurc\b|\bask\b/i);
```

Also verify title `<= 30`, short description `<= 80`, full description `<= 4000`, and release notes `<= 500` Unicode code points.

- [ ] **Step 2: Run tests and verify current Turkish ASCII copy fails**

```bash
node --test scripts/play-copy-quality.test.mjs
```

Expected: FAIL on missing Turkish Unicode quality and the old text.

- [ ] **Step 3: Write final Turkish copy**

Write the following exact files, preserving Turkish characters and paragraph breaks:

`title.txt`:

```text
Astroloji: Günlük Burç
```

`short-description.txt`:

```text
Günlük burç yorumları, uyum analizleri ve haftalık rehber tek yerde.
```

`full-description.txt`:

```text
Gününüzü burcunuza özel, sade ve modern bir astroloji deneyimiyle takip edin.

Astroloji; günlük burç yorumlarını, haftalık ve aylık rehberleri, burç uyumu analizlerini ve kişilik içeriklerini tek uygulamada bir araya getirir.

Uygulamada:

• Burcunuza özel günlük yorum ve enerji görünümü
• Haftalık ve aylık astroloji rehberleri
• Aşk, arkadaşlık ve iş uyumu karşılaştırmaları
• Burç özellikleri ve daha ayrıntılı premium içerikler
• Bildirimler, ana ekran widget'ı ve paylaşılabilir kartlar
• Aylık veya haftalık premium plan seçenekleri

İçerikler seçtiğiniz dil ve burca göre sunulur. Astroloji yorumları eğlence ve kişisel farkındalık amacı taşır; kesin sonuç veya uzman tavsiyesi sunmaz.

Premium üyelik, reklamsız kullanım ve uygulamada belirtilen ek içeriklere erişim sağlar. Aboneliklerinizi Google Play üzerinden yönetebilir veya iptal edebilirsiniz.

Hesabınızı ve uygulamayla ilişkili verilerinizi Ayarlar bölümünden silebilirsiniz. Gizlilik ve hesap silme ayrıntıları için uygulamanın mağaza sayfasındaki bağlantıları kullanın.
```

`release-notes/tr-TR/default.txt`:

```text
Aylık ve haftalık premium plan seçimi iyileştirildi. Plan yükleme hataları için tekrar deneme desteği eklendi; abonelik ekranı ve arka uç doğrulama akışı güçlendirildi.
```

- [ ] **Step 4: Write final English copy**

Write the following exact files:

`title.txt`:

```text
Astrology: Daily Horoscope
```

`short-description.txt`:

```text
Daily horoscopes, zodiac compatibility, and weekly guidance in one app.
```

`full-description.txt`:

```text
Make astrology part of your daily routine with a clean, personalized experience.

Astrology brings together daily horoscopes, weekly and monthly guidance, zodiac compatibility, and personality insights in one app.

Inside the app:

• A daily horoscope and energy overview for your zodiac sign
• Weekly and monthly astrology guidance
• Love, friendship, and work compatibility comparisons
• Zodiac personality insights and deeper premium content
• Notifications, a home screen widget, and shareable cards
• Monthly or weekly premium plan options

Content adapts to your selected language and zodiac sign. Astrology content is provided for entertainment and personal reflection; it does not promise certain outcomes or replace professional advice.

Premium membership provides an ad-free experience and access to the additional content described in the app. You can manage or cancel subscriptions through Google Play.

You can delete your account and associated app data from Settings. Use the privacy and account deletion links on this store page for details.
```

`release-notes/en-US/default.txt`:

```text
Improved monthly and weekly premium plan selection. Added retry support for plan loading errors and strengthened the subscription screen and backend verification flow.
```

- [ ] **Step 5: Add exact keyword-intent documentation**

`tr-TR/keyword-intent.md` records primary concepts `astroloji`, `günlük burç yorumu`, `burçlar`, `aşk uyumu`, `haftalık burç`, and `aylık burç`; secondary concepts `widget`, `bildirim`, `kişilik`, and `premium`; excluded claims `kesin`, `garanti`, `fal`, `tedavi`, `yatırım`, and `ücretsiz deneme`.

`en-US/keyword-intent.md` records primary concepts `astrology`, `daily horoscope`, `zodiac signs`, `compatibility`, `weekly horoscope`, and `monthly horoscope`; secondary concepts `widget`, `notifications`, `personality insights`, and `premium`; excluded claims `guaranteed`, `psychic`, `medical`, `financial`, `legal`, `free trial`, and `annual plan`.

Both documents explain that the title leads with the daily-use intent and the short description combines daily content, compatibility, and recurring guidance without keyword chaining. These files are documentation only and are not uploaded to Play.

- [ ] **Step 6: Expand validator quality checks**

Add checks for:

```javascript
const forbiddenClaims = [
  /free trial/i,
  /annual|yearly/i,
  /guaranteed/i,
  /medical|diagnos/i,
  /financial advice/i,
  /legal advice/i,
  /100% accurate/i,
];
```

Reject a non-English locale whose normalized full description is byte-identical to the English full description, and reject Turkish files with a Turkish-letter ratio below the tested threshold.

- [ ] **Step 7: Run copy and metadata tests**

```bash
node --test scripts/play-copy-quality.test.mjs scripts/play-store-config.test.mjs
node scripts/validate-play-metadata.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add Astroloji/play/listings Astroloji/play/release-notes scripts/play-copy-quality.test.mjs scripts/validate-play-metadata.mjs
git commit -m "feat(play): publish professional Turkish and English copy"
```

---

### Task 3: Policy and Support Identity Answer Set

**Files:**
- Create: `docs/PLAY_POLICY_ANSWER_SET_2026.md`
- Modify: `docs/DATA_SAFETY_2026.md`
- Modify: `docs/PLAY_PRODUCTION_READINESS.md`
- Create: `scripts/lib/play-policy.mjs`
- Create: `scripts/play-policy-answer-set.test.mjs`
- Modify: `scripts/data-safety-contract.test.mjs`

**Interfaces:**
- Consumes: support identity from `store-config.json` and engineering facts in `DATA_SAFETY_2026.md`.
- Produces: `validatePolicyAnswerSet(markdown, storeConfig): string[]`, returning an empty array when policy answers are consistent.

- [ ] **Step 1: Write failing policy consistency tests**

```javascript
const requiredAnswers = [
  'Account deletion: Supported',
  'Account deletion URL: https://astrology.parsfilo.com/delete-account',
  'Privacy policy: https://astrology.parsfilo.com/privacy',
  'Ads: Yes',
  'Purchases: Google Play subscriptions',
  'Data deletion request: Available in app',
  'Optional date of birth: Collected ephemerally for app functionality',
];
for (const answer of requiredAnswers) assert.match(answerSet, new RegExp(escapeRegExp(answer), 'i'));
assert.doesNotMatch(answerSet, /data cannot be deleted/i);
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test scripts/play-policy-answer-set.test.mjs scripts/data-safety-contract.test.mjs
```

Expected: FAIL because the answer-set document and validator do not exist.

- [ ] **Step 3: Write the exact operator answer set**

`docs/PLAY_POLICY_ANSWER_SET_2026.md` must include the following exact operator rows. Fields marked “preserve” are not changed until the read-only Play Console snapshot confirms the current answer and the engineering matrix supports a replacement.

```markdown
| Console section | Exact answer or action | Engineering evidence | Save condition |
|---|---|---|---|
| Developer name | ParsFilo | Store config and public brand | Public page preview shows ParsFilo |
| Support e-mail | info@parsfilo.com | ParsFilo domain identity | A test message is delivered and a reply is received before publication |
| Website | https://astrology.parsfilo.com | Production site | HTTPS 200 and no redirect to another brand |
| Privacy policy | https://astrology.parsfilo.com/privacy | Production privacy route | HTTPS 200 and content covers active SDKs |
| Account deletion | Supported; in-app deletion is available | Settings flow and physical-device smoke | Public page no longer says data cannot be deleted |
| Account deletion URL | https://astrology.parsfilo.com/delete-account | Public backend route | HTTPS 200 and instructions match the app |
| Ads | Yes | Google Mobile Ads SDK, AdMob app, six ad units | UMP and advertising declarations remain enabled |
| App access | No access instructions required for review | Anonymous Firebase onboarding; no reviewer credential gate | Fresh install reaches core experience without supplied credentials |
| Purchases | Google Play subscriptions | BillingClient and backend verification | Products remain premium_monthly/monthly and premium_weekly/weekly |
| Data: date of birth | Optional, collected ephemerally for app functionality | Personal Guidance request; not persisted | No analytics, D1, preference, or log storage exists |
| Data: app interactions | Collected for analytics | Firebase Analytics and bounded event allowlist | No free-form or direct identifiers in event parameters |
| Data: crash logs and diagnostics | Collected for analytics and app stability | Firebase Crashlytics | Provider disclosure and retention reviewed |
| Data: device or other IDs | Collected for app functionality, analytics, notifications, and advertising | Firebase Installation ID, FCM, Mobile Ads/UMP | Advertising and notification purposes remain declared |
| Data: purchase history | Collected for app functionality, fraud prevention, and account management | Play purchase token and subscription state | Account-linked app records are removed on account deletion subject to provider/legal retention |
| Data deletion request | Available in the app and through the public deletion page | Settings deletion flow and public route | Both paths are reachable in the release artifact |
| Target audience | Preserve current answer | No child-directed positioning in the artifact | Read-only snapshot matches current production declaration |
| Content rating | Preserve current questionnaire answers | Existing PEGI 3 public rating | No new content category was added by metadata work |
```

The document also contains a provider matrix with exactly these active processors: Firebase Authentication, Firebase Analytics, Firebase Crashlytics, Firebase Cloud Messaging, Firebase Remote Config, Firebase Installations, Google Mobile Ads/UMP, Google Play Billing, Google Play Developer API, and Cloudflare. Each provider row states the transmitted data categories, purpose, account-deletion behavior, and the supporting source file or live configuration check.

- [ ] **Step 4: Implement pure policy validator**

The validator must compare support URLs/e-mail against `store-config.json`, require every active provider from `DATA_SAFETY_2026.md`, reject “data cannot be deleted,” and return stable human-readable errors.

- [ ] **Step 5: Update readiness checklists**

Replace the stale statement that Play reports data cannot be deleted with an operator gate that requires a post-save public-page verification. Keep the release rollout hold at 10%.

- [ ] **Step 6: Run policy tests**

```bash
node --test scripts/play-policy-answer-set.test.mjs scripts/data-safety-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add docs/PLAY_POLICY_ANSWER_SET_2026.md docs/DATA_SAFETY_2026.md docs/PLAY_PRODUCTION_READINESS.md scripts/lib/play-policy.mjs scripts/play-policy-answer-set.test.mjs scripts/data-safety-contract.test.mjs
git commit -m "docs(play): reconcile policy and support identity"
```

---

### Task 4: Asset Manifest and Play Image Validation

**Files:**
- Create: `Astroloji/play/asset-manifest.json`
- Create: `scripts/lib/play-assets.mjs`
- Create: `scripts/play-assets.test.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `readImageInfo(filePath): { format, width, height }`, `sha256(filePath): string`, and `validateAssetManifest(rootDir, config): string[]`.

- [ ] **Step 1: Write failing image/manifest tests**

Use temporary PNG fixtures with a valid PNG signature and IHDR. Tests must verify:

```javascript
assert.deepEqual(readImageInfo(iconPath), { format: 'png', width: 512, height: 512 });
assert.deepEqual(readImageInfo(featurePath), { format: 'png', width: 1024, height: 500 });
assert.equal(errors.filter((error) => error.includes('phoneScreenshots')).length, 0);
assert.throws(() => validateChecksum(tamperedFile, expected), /checksum mismatch/i);
```

Reject unsupported MIME types, dimensions outside Play constraints, fewer or more than six phone screenshots, duplicate filenames, duplicate checksums within one locale, cross-locale screenshots with identical checksums, and manifest paths escaping `Astroloji/play/assets`.

- [ ] **Step 2: Run and verify RED**

```bash
node --test scripts/play-assets.test.mjs
```

Expected: FAIL because `play-assets.mjs` does not exist.

- [ ] **Step 3: Implement PNG/JPEG header parsing**

Use built-in `fs`; do not add an image library merely for validation. PNG dimensions come from bytes 16–23. JPEG dimensions are read by scanning SOF markers. Reject malformed images with a deterministic error.

- [ ] **Step 4: Define manifest schema**

Every record must contain:

```json
{
  "locale": "tr-TR",
  "role": "phoneScreenshot",
  "order": 1,
  "path": "tr-TR/phoneScreenshots/01-daily.png",
  "format": "png",
  "width": 1080,
  "height": 1920,
  "sha256": "64-lowercase-hex"
}
```

The icon may use `locale: "shared"`; feature graphics and phone screenshots must be localized.

- [ ] **Step 5: Run focused tests**

```bash
node --test scripts/play-assets.test.mjs
```

Expected: PASS. The main metadata validator is not wired to final asset presence until Task 6, so this commit remains independently green.

- [ ] **Step 6: Commit**

```bash
git add Astroloji/play/asset-manifest.json scripts/lib/play-assets.mjs scripts/play-assets.test.mjs .gitignore
git commit -m "feat(play): add localized asset manifest validation"
```

---

### Task 5: Deterministic Production-Accurate Store Scenes

**Files:**
- Create: `Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/store/StoreScreenshotFixtures.kt`
- Create: `Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/store/StoreListingScreenshotTest.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/daily/DailyScreen.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/weekly/WeeklyScreen.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/monthly/MonthlyScreen.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/compatibility/CompatibilityScreen.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/personality/PersonalityScreen.kt`
- Modify: `Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium/PremiumOfferComponents.kt`
- Create: `scripts/store-screenshot-contract.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces twelve `@PreviewTest` previews: six narratives × `en` and `tr-rTR`.
- Fixed fixture callbacks perform no I/O and fixture data contains no personal identifiers.

- [ ] **Step 1: Write the failing screenshot contract test**

```javascript
const source = readFileSync('Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/store/StoreListingScreenshotTest.kt', 'utf8');
for (const scene of ['Daily', 'Guidance', 'Compatibility', 'Personality', 'Tools', 'Premium']) {
  assert.match(source, new RegExp(`Store${scene}EnglishScreenshot`));
  assert.match(source, new RegExp(`Store${scene}TurkishScreenshot`));
}
assert.equal((source.match(/@PreviewTest/g) ?? []).length, 12);
assert.doesNotMatch(source, /email|token|firebase|device id|test user/i);
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test scripts/store-screenshot-contract.test.mjs
```

Expected: FAIL because the screenshot source does not exist.

- [ ] **Step 3: Extract dependency-free rendering surfaces**

For each production feature, preserve the public ViewModel-bound screen and extract an `internal` content composable. Example pattern:

```kotlin
@Composable
internal fun DailyContent(
    uiState: DailyUiState,
    onEvent: (DailyUiEvent) -> Unit,
    onShare: () -> Unit,
    onOpenPremium: () -> Unit,
)

@Composable
internal fun WeeklyContent(
    uiState: WeeklyUiState,
    onEvent: (WeeklyUiEvent) -> Unit,
    onOpenPremium: () -> Unit,
)

@Composable
internal fun MonthlyContent(
    uiState: MonthlyUiState,
    onEvent: (MonthlyUiEvent) -> Unit,
)

@Composable
internal fun CompatibilityContent(
    uiState: CompatibilityUiState,
    onEvent: (CompatibilityUiEvent) -> Unit,
)

@Composable
internal fun PersonalityContent(
    uiState: PersonalityUiState,
    onEvent: (PersonalityUiEvent) -> Unit,
)
```

Move each current screen-rendering body unchanged into its corresponding content composable. The existing public screen continues to collect its ViewModel state and forwards events to the new content function. `PremiumOfferCard` is already `internal`; keep its existing interface and reuse it directly. Do not move data loading or business logic into screenshot sources.

- [ ] **Step 4: Create non-personal deterministic fixtures**

`StoreScreenshotFixtures.kt` must construct stable domain/UI state with:

- Aries as a generic selected sign.
- Fixed localized fixture copy stored as constants in `StoreScreenshotFixtures.kt`: daily headline, weekly/monthly guidance, compatibility labels, personality labels, tools labels, and premium benefit labels. The fixture never reads network or backend content.
- Fixed monthly and weekly premium plans only.
- Ads hidden, loading false, errors null, and no notification shade/device identifiers.
- Callbacks as empty lambdas.

- [ ] **Step 5: Create twelve localized preview tests**

Each preview uses:

```kotlin
@PreviewTest
@Preview(device = "spec:width=360dp,height=640dp,dpi=480", locale = "en", showBackground = true)
@Composable
fun StoreDailyEnglishScreenshot() = StoreDailyScene(storeDailyFixture)
```

Turkish variants use `locale = "tr-rTR"`. The first three scenes must communicate daily value, weekly/monthly guidance, and compatibility.

- [ ] **Step 6: Add CI enforcement**

Extend the existing screenshot job to run both the paywall and store-listing golden suites with:

```bash
./gradlew validateDebugScreenshotTest \
  -Pandroid.experimental.enableScreenshotTest=true \
  -Pandroid.sync.suppressAgpWarnings=UNSUPPORTED_PROJECT_OPTION_USE
```

- [ ] **Step 7: Run RED golden verification, update goldens, and verify GREEN**

```bash
cd Astroloji
./gradlew validateDebugScreenshotTest -Pandroid.experimental.enableScreenshotTest=true -Pandroid.sync.suppressAgpWarnings=UNSUPPORTED_PROJECT_OPTION_USE
./gradlew updateDebugScreenshotTest -Pandroid.experimental.enableScreenshotTest=true -Pandroid.sync.suppressAgpWarnings=UNSUPPORTED_PROJECT_OPTION_USE
./gradlew validateDebugScreenshotTest -Pandroid.experimental.enableScreenshotTest=true -Pandroid.sync.suppressAgpWarnings=UNSUPPORTED_PROJECT_OPTION_USE
```

- [ ] **Step 8: Run Android quality gates**

```bash
./gradlew testDebugUnitTest detekt ktlintCheck lintDebug
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add Astroloji/app/src/main Astroloji/app/src/screenshotTest Astroloji/app/src/screenshotTestDebug/reference scripts/store-screenshot-contract.test.mjs .github/workflows/ci.yml
git commit -m "test(android): add localized Play store screenshot scenes"
```

---

### Task 6: Play-Ready Marketing Asset Export

**Files:**
- Create: `scripts/export-play-assets.mjs`
- Create: `scripts/export-play-assets.test.mjs`
- Create: `Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/store/StoreFeatureGraphicScreenshotTest.kt`
- Create: `Astroloji/play/assets/source/store-scenes.json`
- Create: `Astroloji/play/assets/shared/icon/icon.png`
- Create: `Astroloji/play/assets/en-US/featureGraphic/feature-graphic.png`
- Create: `Astroloji/play/assets/en-US/phoneScreenshots/01-daily.png`
- Create: `Astroloji/play/assets/en-US/phoneScreenshots/02-guidance.png`
- Create: `Astroloji/play/assets/en-US/phoneScreenshots/03-compatibility.png`
- Create: `Astroloji/play/assets/en-US/phoneScreenshots/04-personality.png`
- Create: `Astroloji/play/assets/en-US/phoneScreenshots/05-tools.png`
- Create: `Astroloji/play/assets/en-US/phoneScreenshots/06-premium.png`
- Create: `Astroloji/play/assets/tr-TR/featureGraphic/feature-graphic.png`
- Create: `Astroloji/play/assets/tr-TR/phoneScreenshots/01-daily.png`
- Create: `Astroloji/play/assets/tr-TR/phoneScreenshots/02-guidance.png`
- Create: `Astroloji/play/assets/tr-TR/phoneScreenshots/03-compatibility.png`
- Create: `Astroloji/play/assets/tr-TR/phoneScreenshots/04-personality.png`
- Create: `Astroloji/play/assets/tr-TR/phoneScreenshots/05-tools.png`
- Create: `Astroloji/play/assets/tr-TR/phoneScreenshots/06-premium.png`
- Modify: `Astroloji/play/asset-manifest.json`

**Interfaces:**
- Consumes: deterministic Android golden PNGs from Task 5.
- Produces: 1080×1920 phone screenshots, 1024×500 localized feature graphics, shared 512×512 icon, and updated manifest checksums.

- [ ] **Step 1: Write failing export tests**

The exporter test invokes the command against temporary source images and asserts deterministic output names, dimensions, and identical checksums across two runs with identical input.

```javascript
assert.deepEqual(exported.map((item) => item.path), [
  'shared/icon/icon.png',
  'en-US/featureGraphic/feature-graphic.png',
  'en-US/phoneScreenshots/01-daily.png',
  'en-US/phoneScreenshots/02-guidance.png',
  'en-US/phoneScreenshots/03-compatibility.png',
  'en-US/phoneScreenshots/04-personality.png',
  'en-US/phoneScreenshots/05-tools.png',
  'en-US/phoneScreenshots/06-premium.png',
  'tr-TR/featureGraphic/feature-graphic.png',
  'tr-TR/phoneScreenshots/01-daily.png',
  'tr-TR/phoneScreenshots/02-guidance.png',
  'tr-TR/phoneScreenshots/03-compatibility.png',
  'tr-TR/phoneScreenshots/04-personality.png',
  'tr-TR/phoneScreenshots/05-tools.png',
  'tr-TR/phoneScreenshots/06-premium.png',
]);
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test scripts/export-play-assets.test.mjs
```

- [ ] **Step 3: Implement deterministic compositing**

Render every marketing image with the existing Android Compose Screenshot plugin. `StoreListingScreenshotTest.kt` exports phone scenes with `device = "spec:width=360dp,height=640dp,dpi=480"`, producing 1080×1920 PNGs while preserving a realistic 360dp phone layout. `StoreFeatureGraphicScreenshotTest.kt` exports two localized feature graphics with `widthDp = 1024`, `heightDp = 500`, and the default 160dpi preview density, producing 1024×500 PNGs. `export-play-assets.mjs` does not rasterize or redesign images; it maps verified golden filenames to canonical Play filenames, copies bytes, and writes checksums. Missing or ambiguous golden matches are fatal.

The Compose marketing wrapper must include:

- localized headline outside the real app screenshot,
- decorative zodiac background that does not imply unsupported features,
- no ratings, awards, user counts, testimonials, countdowns, or discount percentages,
- safe margins and readable text at 25% thumbnail scale.

- [ ] **Step 4: Export both locales**

```bash
cd Astroloji
./gradlew updateDebugScreenshotTest -Pandroid.experimental.enableScreenshotTest=true -Pandroid.sync.suppressAgpWarnings=UNSUPPORTED_PROJECT_OPTION_USE
cd ..
node scripts/export-play-assets.mjs --source-root Astroloji/app/src/screenshotTestDebug/reference --output-root Astroloji/play/assets
```

- [ ] **Step 5: Inspect every output**

Open all twelve phone screenshots and two feature graphics side by side. Verify locale purity, correct monthly/weekly premium plans, no clipped text, and production-accurate UI.

- [ ] **Step 6: Generate the manifest and wire asset validation into metadata validation**

The exporter writes `asset-manifest.json` only after every image succeeds. Update `scripts/validate-play-metadata.mjs` to call `validateAssetManifest` after text/locale validation. Then run:

```bash
node --test scripts/export-play-assets.test.mjs scripts/play-assets.test.mjs
node scripts/validate-play-metadata.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/export-play-assets.mjs scripts/export-play-assets.test.mjs scripts/validate-play-metadata.mjs Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/store/StoreFeatureGraphicScreenshotTest.kt Astroloji/app/src/screenshotTestDebug/reference Astroloji/play/assets Astroloji/play/asset-manifest.json
git commit -m "feat(play): export localized marketing assets"
```

---

### Task 7: Play API Client, Backup, and Independent Read-Back

**Files:**
- Create: `scripts/lib/play-api-client.mjs`
- Create: `scripts/lib/play-backup.mjs`
- Create: `scripts/play-api-client.test.mjs`
- Create: `scripts/play-backup.test.mjs`
- Create: `scripts/backup-play-metadata.mjs`
- Create: `scripts/readback-play-metadata.mjs`

**Interfaces:**
- Produces: `createPlayClient({ packageName, credentialsPath, fetchImpl })`, `capturePlayBackup(client): Promise<PlayBackup>`, and `verifyLiveState(client, expected): Promise<string[]>`.

- [ ] **Step 1: Write mocked API tests**

Mock `fetchImpl` and verify:

- JWT token exchange is requested without logging credentials.
- A Play edit is created for edit-scoped listing/image reads.
- Listings, image metadata, tracks, and subscription IDs are captured.
- Backup JSON contains no access token, private key, tester e-mail, or credential path.
- Read-back reports rollout or subscription drift.

- [ ] **Step 2: Run and verify RED**

```bash
node --test scripts/play-api-client.test.mjs scripts/play-backup.test.mjs
```

- [ ] **Step 3: Extract API behavior from the current publisher**

Move JWT/token and HTTP logic out of `publish-play-metadata.mjs` into `play-api-client.mjs`. Public methods must include:

```javascript
client.createEdit();
client.listListings(editId);
client.getListing(editId, locale);
client.listImages(editId, locale, imageType);
client.getTrack(editId, track);
client.listSubscriptions();
client.commitEdit(editId, { changesNotSentForReview });
client.deleteEdit(editId);
```

- [ ] **Step 4: Implement secret-safe backup serialization**

Backup schema must include timestamp, package, listing text, image metadata/checksum where downloadable, production/internal track release state, and subscription product/base-plan identifiers. It must not contain credentials or access tokens.

- [ ] **Step 5: Implement CLI commands**

```bash
node scripts/backup-play-metadata.mjs --output /secure/path/play-backup-20260806.json
node scripts/readback-play-metadata.mjs --expected-root Astroloji/play --assert-rollout 0.1
```

Both commands require `PLAY_PACKAGE_NAME` and `PLAY_SERVICE_ACCOUNT_JSON_PATH`; output paths must be outside the repository by default.

- [ ] **Step 6: Run tests and a live read-only backup**

Run unit tests first. Then create a temporary `0600` credential file through Doppler and use a trap to delete credentials and backup after inspecting a redacted summary.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/play-api-client.mjs scripts/lib/play-backup.mjs scripts/play-api-client.test.mjs scripts/play-backup.test.mjs scripts/backup-play-metadata.mjs scripts/readback-play-metadata.mjs scripts/publish-play-metadata.mjs
git commit -m "feat(play): add backup and independent readback"
```

---

### Task 8: Dry-Run Diff, Publication, and Rollback

**Files:**
- Create: `scripts/lib/play-diff.mjs`
- Create: `scripts/play-diff.test.mjs`
- Create: `scripts/diff-play-metadata.mjs`
- Modify: `scripts/publish-play-metadata.mjs`
- Create: `scripts/restore-play-metadata.mjs`
- Create: `scripts/play-publication.test.mjs`

**Interfaces:**
- Consumes: backup schema from Task 7 and canonical content/assets from Tasks 2 and 6.
- Produces: `buildPlayDiff(live, proposed): PlayDiff`, `formatPlayDiff(diff): string`, and rollback from a selected backup.

- [ ] **Step 1: Write deterministic diff snapshot tests**

Test added/changed/removed locale text, image replacement, track invariants, and unchanged subscription catalog. Expected diff format:

```text
LISTING tr-TR title: CHANGED
LISTING en-US fullDescription: CHANGED
IMAGE tr-TR phoneScreenshots: 3 -> 6
TRACK production rolloutFraction: UNCHANGED 0.1
SUBSCRIPTIONS: UNCHANGED premium_monthly/monthly, premium_weekly/weekly
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test scripts/play-diff.test.mjs scripts/play-publication.test.mjs
```

- [ ] **Step 3: Implement dry-run diff**

`diff-play-metadata.mjs` must read live backup plus canonical source, print the human-readable diff, write a JSON diff beside the operator-selected backup path, and exit non-zero on rollout/subscription drift.

- [ ] **Step 4: Extend publication to images**

For each supported locale, update listing text, delete old image slots only inside the uncommitted edit, upload exactly one feature graphic and six phone screenshots, and verify edit-local state before commit.

- [ ] **Step 5: Add publication confirmation**

Require:

```text
PUBLISH_TR_EN_METADATA_<live-backup-sha256-prefix>
```

The command refuses a missing or mismatched confirmation and refuses a backup older than the configured publication window.

- [ ] **Step 6: Implement rollback**

`restore-play-metadata.mjs` reads a backup, reconstructs listings/assets in a new edit, shows a dry-run, and requires:

```text
RESTORE_PLAY_METADATA_<backup-sha256-prefix>
```

- [ ] **Step 7: Run mocked publication tests**

Verify partial image upload abandons the edit and never calls commit. Verify successful publication calls independent read-back after commit.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/play-diff.mjs scripts/play-diff.test.mjs scripts/diff-play-metadata.mjs scripts/publish-play-metadata.mjs scripts/restore-play-metadata.mjs scripts/play-publication.test.mjs
git commit -m "feat(play): add safe metadata publication and rollback"
```

---

### Task 9: Unsupported Live Locale Cleanup Guard

**Files:**
- Create: `scripts/cleanup-play-locales.mjs`
- Create: `scripts/play-locale-cleanup.test.mjs`
- Modify: `scripts/lib/play-diff.mjs`
- Modify: `docs/PLAY_STORE_OPTIMIZATION_RUNBOOK.md`

**Interfaces:**
- Consumes: complete backup and live-state digest.
- Produces: destructive cleanup that removes only locales outside `['en-US', 'tr-TR']`.

- [ ] **Step 1: Write failing destructive-guard tests**

Tests must verify cleanup refuses when:

- backup locale count differs from current live locale count,
- current live digest differs from the dry-run digest,
- supported locales are absent,
- removal count differs from confirmation,
- backup file checksum is wrong,
- production rollout is not 0.1.

- [ ] **Step 2: Run and verify RED**

```bash
node --test scripts/play-locale-cleanup.test.mjs
```

- [ ] **Step 3: Implement exact cleanup plan**

Dry-run prints every locale to remove and requires this exact confirmation:

```text
REMOVE_<count>_UNSUPPORTED_PLAY_LOCALES_<state-digest-prefix>
```

Delete listing resources in a new Play edit, re-read the edit, assert `en-US` and `tr-TR` are intact, commit, then independently verify exactly two locales remain.

- [ ] **Step 4: Add rollback instructions**

The runbook must identify the exact backup path/checksum and restore command produced before cleanup. Locale cleanup is never combined with text/image publication in one command.

- [ ] **Step 5: Run tests**

```bash
node --test scripts/play-locale-cleanup.test.mjs scripts/play-diff.test.mjs
```

- [ ] **Step 6: Commit**

```bash
git add scripts/cleanup-play-locales.mjs scripts/play-locale-cleanup.test.mjs scripts/lib/play-diff.mjs docs/PLAY_STORE_OPTIMIZATION_RUNBOOK.md
git commit -m "feat(play): guard unsupported locale cleanup"
```

---

### Task 10: Metadata Workflow Safety Gates

**Files:**
- Modify: `.github/workflows/android-metadata.yml`
- Modify: `scripts/android-metadata-workflow.test.mjs`
- Create: `scripts/play-workflow-contract.test.mjs`
- Modify: `Astroloji/play/README.md`

**Interfaces:**
- Produces workflow modes `validate`, `backup`, `diff`, `publish`, `cleanup`, `readback`, and `restore` with exact confirmation inputs.

- [ ] **Step 1: Write failing workflow contract tests**

Assert that:

```javascript
assert.match(workflow, /mode:[\s\S]*validate[\s\S]*backup[\s\S]*diff[\s\S]*publish[\s\S]*cleanup[\s\S]*readback[\s\S]*restore/);
assert.match(workflow, /ENABLE_METADATA_PUBLISH/);
assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
assert.match(workflow, /artifact.*backup/i);
assert.match(workflow, /readback-play-metadata\.mjs/);
assert.match(workflow, /ENABLE_METADATA_PUBLISH=false/);
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test scripts/android-metadata-workflow.test.mjs scripts/play-workflow-contract.test.mjs
```

- [ ] **Step 3: Add workflow inputs and job separation**

Validation always runs. Mutating modes require `github.repository == 'MakerParsDev/Astroloji'`, `main`, production environment approval, and `vars.ENABLE_METADATA_PUBLISH == 'true'`. Backup/diff/read-back remain read-only.

- [ ] **Step 4: Add safe credential lifecycle**

Workflow writes the service account to `${{ runner.temp }}/play-service-account.json`, runs `chmod 600`, and has an `if: always()` cleanup step that removes credential files. Backups/diffs are uploaded as encrypted/private workflow artifacts with bounded retention and no secrets.

- [ ] **Step 5: Add gate restoration check**

The workflow summary instructs the operator to restore `ENABLE_METADATA_PUBLISH=false`; an independent final job fails when the repository variable remains true after the approved window.

- [ ] **Step 6: Run all workflow tests**

```bash
node --test scripts/android-metadata-workflow.test.mjs scripts/play-workflow-contract.test.mjs
```

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/android-metadata.yml scripts/android-metadata-workflow.test.mjs scripts/play-workflow-contract.test.mjs Astroloji/play/README.md
git commit -m "ci(play): harden metadata publication workflow"
```

---

### Task 11: Measurement Baseline and Rollout Governance

**Files:**
- Create: `scripts/capture-play-baseline.mjs`
- Create: `scripts/play-baseline.test.mjs`
- Create: `docs/PLAY_STORE_BASELINE_2026-08-06.json`
- Create: `docs/PLAY_STORE_MEASUREMENT.md`
- Modify: `docs/PLAY_STORE_OPTIMIZATION_RUNBOOK.md`

**Interfaces:**
- Produces a redacted baseline schema and a comparison procedure; it does not change rollout.

- [ ] **Step 1: Write baseline schema tests**

The schema must contain collection timestamps and nullable values for unavailable APIs, but never invent zeroes. Required sections:

```json
{
  "window": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "play": { "productionRolloutFraction": 0.1, "ratings": null, "reviews": null },
  "stability": { "crashRate": null, "anrRate": null },
  "analytics": { "activeUsers": null, "sessions": null, "events": null },
  "subscriptions": { "premiumScreenViews": null, "purchaseStarts": null, "verifiedPurchases": null },
  "ads": { "requests": null, "matchedRequests": null, "impressions": null }
}
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test scripts/play-baseline.test.mjs
```

- [ ] **Step 3: Implement secret-safe collectors**

Use available Play Developer Reporting, GA4 Data API, and AdMob reporting access. Record `null` plus an explanatory `unavailableReason` when access or aggregation thresholds prevent a metric. Do not print account e-mail addresses or raw user dimensions.

- [ ] **Step 4: Capture pre-publication baseline**

Use a fixed 30-day window ending on the latest complete reporting date. Store only redacted aggregate output in `docs/PLAY_STORE_BASELINE_2026-08-06.json`.

- [ ] **Step 5: Document interpretation and rollout hold**

`PLAY_STORE_MEASUREMENT.md` must state that metadata changes do not prove causation without an experiment. Production remains at 10% until a separate approval reviews stability, conversion, retention, ratings, and subscription behavior.

- [ ] **Step 6: Run tests and secret scan**

```bash
node --test scripts/play-baseline.test.mjs
node scripts/scan-secrets.mjs
```

- [ ] **Step 7: Commit**

```bash
git add scripts/capture-play-baseline.mjs scripts/play-baseline.test.mjs docs/PLAY_STORE_BASELINE_2026-08-06.json docs/PLAY_STORE_MEASUREMENT.md docs/PLAY_STORE_OPTIMIZATION_RUNBOOK.md
git commit -m "docs(play): establish store optimization baseline"
```

---

### Task 12: Full Verification and Bounded Live Play Operations

**Files:**
- Modify: `docs/PLAY_STORE_OPTIMIZATION_RUNBOOK.md`
- Create: `docs/verification/global-play-store-optimization-2026-08-06.md`
- No production source change unless verification finds a defect.

**Interfaces:**
- Consumes all preceding tasks.
- Produces CI evidence, Play backup/diff/read-back evidence, and the exact UI-only policy mutation record.

- [ ] **Step 1: Run complete repository verification**

From the repository root:

```bash
node --test scripts/*.test.mjs
node scripts/validate-play-metadata.mjs
node scripts/scan-secrets.mjs
cd backend
npm ci
npm audit --audit-level=high
npm run build
npm test
cd ../Astroloji
./gradlew testDebugUnitTest detekt ktlintCheck lintDebug validateDebugScreenshotTest assembleDebug bundleRelease
```

Expected: all commands PASS; Lint reports zero issues; twelve store previews plus existing paywall previews validate.

- [ ] **Step 2: Review every generated asset visually**

Verify the six-scene narrative in both languages, text legibility, locale purity, no personal data, no debug UI, no unsupported claims, and monthly/weekly premium only. Record SHA-256 values in the verification document.

- [ ] **Step 3: Push branch and open a PR**

Push `feat/global-play-store-optimization-20260806`, open a PR to `main`, and require all GitHub CI/security checks plus review comments to be resolved before merge.

- [ ] **Step 4: Merge and capture a fresh live backup**

After green CI and merge, use the merged commit. Create a fresh backup and dry-run diff. Verify production rollout `0.1`, production version code unchanged, and subscriptions exactly:

```text
premium_monthly / monthly / P1M
premium_weekly  / weekly  / P1W
```

- [ ] **Step 5: Publish Turkish and English text/assets**

Temporarily set `ENABLE_METADATA_PUBLISH=true`, run the metadata workflow in `publish` mode with the exact backup-bound confirmation, wait for success, then restore the variable to `false`. Do not run locale cleanup in this step.

- [ ] **Step 6: Perform independent read-back**

Verify canonical text byte-for-byte after normalization, one localized feature graphic and six localized phone screenshots per locale, unchanged rollout, unchanged production release, and unchanged subscription catalog.

- [ ] **Step 7: Execute unsupported locale cleanup**

Create a new backup and cleanup dry-run against the current state. Approve only the exact removal count/digest. Remove unsupported locales, then verify live listings are exactly `en-US` and `tr-TR`. Keep the full pre-cleanup backup for rollback.

- [ ] **Step 8: Reconcile UI-only Play policy fields**

Open a bounded Play Console browser session. First perform a read-only snapshot. Compare every current answer against `PLAY_POLICY_ANSWER_SET_2026.md`. Create a state-bound high-impact action plan containing the exact fields to change. Apply only after approval; stop without save when the DOM/state digest differs.

Required final public statements include:

```text
Account deletion: supported
Deletion URL: https://astrology.parsfilo.com/delete-account
Privacy policy: https://astrology.parsfilo.com/privacy
Ads: declared
```

- [ ] **Step 9: Verify the public listing**

After Play propagation, check Turkish and English public pages. Confirm support identity, privacy/deletion links, text, screenshots, data-deletion statement, and rollout. Record any propagation delay explicitly rather than claiming completion early.

- [ ] **Step 10: Capture post-change baseline marker**

Record publication timestamps and a post-change baseline marker. Do not expand rollout. Schedule comparison only after a statistically meaningful observation window.

- [ ] **Step 11: Final verification document**

Write `docs/verification/global-play-store-optimization-2026-08-06.md` with:

- merged commit and PR,
- local and GitHub test results,
- asset checksums,
- live backup checksum/path reference,
- dry-run diff summary,
- Play workflow run IDs,
- supported live locales,
- policy read-back result,
- production rollout fraction,
- subscription catalog read-back,
- rollback command and backup checksum,
- known reporting delays or inaccessible UI-only fields.

- [ ] **Step 12: Commit redacted verification evidence**

After successful live read-back, commit `docs/verification/global-play-store-optimization-2026-08-06.md`. Do not commit credentials, private backups, access tokens, tester identities, raw account data, or browser snapshots containing account data.

---

## Plan Self-Review

### Spec coverage

- Policy and trust reconciliation: Tasks 3 and 12.
- Turkish/English ASO copy: Task 2.
- Localized visual asset system: Tasks 4–6.
- Backup, dry-run, publication, rollback, cleanup, and read-back: Tasks 7–10 and 12.
- Measurement and rollout governance: Task 11 and Task 12.
- Exactly two live locales and unchanged 10% rollout: Tasks 1, 9, and 12.

### Type and interface consistency

- `StoreConfig` is loaded by `loadStoreConfig(rootDir)` and consumed by metadata, asset, policy, and workflow tooling.
- Play API behavior is centralized in `createPlayClient` and reused by backup, publication, cleanup, restore, and read-back commands.
- Backup schema is the input to diff, cleanup confirmation, rollback, and verification evidence.
- Asset manifest is generated by the exporter and validated by the metadata validator before any upload.

### Prohibited placeholders

This plan contains no deferred implementation markers. Every destructive operation has an exact prerequisite, confirmation format, verification step, and rollback path.
