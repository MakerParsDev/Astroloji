# Real-device Google Play screenshot redesign

Date: 2026-08-07
Owner: MakerParsDev
Repository: MakerParsDev/Astroloji
Status: approved design, implementation pending

## Problem

The current Google Play phone screenshots are generated from synthetic Compose `screenshotTest` store scenes. They are deterministic and testable, but they are not captures of the current application running on a physical Android device. At Play thumbnail scale the composition is visually weak: dark headline text and dark purple surfaces collapse into each other, the product UI is scaled too small, too much empty/dark area is visible, and the first screenshots do not communicate value quickly.

Physical-device investigation on the connected Redmi 5 Plus confirmed an additional truth gap: the device currently has `versionCode=1100`, `versionName=1.0.100-smoke`, while production is newer. ADB inspection showed real populated Home, Compatibility and Profile screens, while the old smoke build Premium accessibility tree did not expose comparable content. Therefore neither the existing synthetic store scenes nor the installed 1100 build can be treated as the final source of truth for a refreshed listing.

## Decision

Use a **real-device-first marketing screenshot pipeline**.

The app under test will be a current QA build installed with a non-production application id so the production package on the device is not overwritten. The six store stories will be captured from the running app with ADB, then composed into deterministic 1080×2400 marketing frames for `tr-TR` and `en-US`.

Synthetic Compose store scenes will no longer be the canonical source for Play phone screenshots. Compose screenshot tests may remain for component regression coverage, but they must not be exported as the final Play phone assets.

## Capture source

1. Build the current `main` code as an isolated QA variant/application id.
2. Install it alongside `com.parsfilo.astrology`; do not replace the production package.
3. Use deterministic, identity-free fixture/session data where required to make screens stable.
4. Capture with ADB at the physical device resolution.
5. Record source metadata for every capture:
   - Git SHA
   - QA version name/code
   - device model/serial hash or non-sensitive device alias
   - Android API level
   - locale
   - target screen/story
   - source PNG SHA-256
6. No real purchase will be performed. Premium screenshots use a deterministic non-purchasing QA state.

## Six-story sequence

The order is fixed for both locales:

1. **Daily horoscope** — real Home screen, cropped to the strongest daily energy/commentary section.
2. **Weekly and monthly outlook** — real guidance content, emphasizing forward-looking value rather than dense body copy.
3. **Compatibility** — real Compatibility screen with the pair and score clearly visible.
4. **Personal profile** — real Profile/sign identity area, emphasizing personalization.
5. **Daily routine/tools** — a real in-app routine/reminder/widget-related surface that exists in the current product. Do not invent UI that is not shipped.
6. **Premium** — real current paywall UI with monthly and weekly plans, no purchase action.

If the current app has no real screen supporting story 5, replace that story with another shipped, high-value screen rather than fabricating a tool card.

## Marketing frame

Each final phone screenshot is 1080×2400 portrait PNG.

### Visual hierarchy

- Headline at the top in high-contrast near-white text.
- One short supporting sentence maximum.
- Headline must remain legible when the screenshot is rendered as a narrow Google Play carousel thumbnail.
- Product capture is the dominant element, using approximately 130–170% visual scale compared with the current layout.
- Crop to the meaningful product area instead of shrinking the complete phone screen into a small card.
- Reduce dead/dark area aggressively.
- Preserve the app’s premium dark/cosmic identity, but use a lighter/clearer marketing surface behind type so headline contrast does not depend on the in-app surface color.
- No misleading UI, fake reviews, awards, rankings, discount claims, or functionality that is not shipped.

### Copy constraints

- One headline and at most one supporting sentence per frame.
- Turkish and English copy is written independently for natural language, not machine-translated word-for-word.
- Text must describe the visible screen accurately.
- Avoid tiny explanatory paragraphs inside the marketing frame.

## Canonical assets and source layout

Final published assets remain under:

- `Astroloji/play/assets/tr-TR/phoneScreenshots/`
- `Astroloji/play/assets/en-US/phoneScreenshots/`

Real capture sources and composition metadata will be versioned under a dedicated source directory beneath `Astroloji/play/assets/source/` rather than mixed into generated final assets.

The asset manifest continues to bind every published PNG by dimensions and SHA-256. Source capture metadata must also bind the source PNG SHA-256 and Git SHA used for capture.

## Deterministic composition

The marketing frame composer must be deterministic:

- fixed canvas size
- fixed typography/layout constants
- fixed crop/scale specification per story
- no network-loaded fonts or images
- no generation-time timestamps embedded into raster output
- output hash changes only when source capture, copy, or layout input changes

The composer may use checked-in application captures and programmatic rendering. The final raster must not rely on manual Photoshop-only state that cannot be reproduced from the repository.

## Quality gates

Before publication all twelve phone screenshots must pass:

1. 1080×2400 PNG validation.
2. Locale purity checks for visible marketing text.
3. Manifest SHA-256 validation.
4. Source-capture provenance validation.
5. Thumbnail QA at narrow carousel scale.
6. Full-size visual QA for clipping, contrast and misleading content.
7. Cross-check against the current physical QA build.
8. TR/EN story-order parity.

A contact sheet for TR and EN will be generated as a QA artifact but will not be published to Play.

## Play publication safety

1. Take a fresh Play backup before replacing phone screenshots.
2. Diff only `phoneScreenshots` for `tr-TR` and `en-US`; icon, feature graphic, subscriptions, rollout and listing text must remain unchanged unless a separate approved task changes them.
3. Replace images in an uncommitted Play edit.
4. Verify edit-local image count, dimensions and hashes before commit.
5. Commit only after exact state-bound confirmation.
6. Perform independent post-commit read-back and a new backup.
7. Keep the previous Play backup as the rollback source.

## Non-goals

- No production rollout change.
- No subscription change.
- No app feature redesign as part of the store screenshot task.
- No real Play purchase.
- No fabricated widget/tool screen.
- No re-expansion beyond `tr-TR` and `en-US`.

## Success criteria

The task is complete when:

- twelve real-device-derived Play phone screenshots are reproducible from repository inputs,
- both locale sets are readable at thumbnail scale,
- the visible app UI matches the current QA build,
- the final Play read-back reports six screenshots for each supported locale with the expected hashes,
- no unrelated Play state changes.
