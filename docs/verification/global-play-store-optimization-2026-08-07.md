# Global Play Store Optimization Verification — 2026-08-07

## Scope

This document records redacted verification evidence for the global Google Play Store optimization work for `com.parsfilo.astrology`.

Canonical repository and Git identity:

```text
repository: MakerParsDev/Astroloji
branch: feat/global-play-store-optimization-20260806
verified implementation HEAD: 955f6146d55bb0f3be0d666fad553cafcc73b57d
author/committer: MakerParsDev <makerpars@gmail.com>
origin: https://github.com/MakerParsDev/Astroloji.git
```

Review-fix commits on the final implementation tree:

```text
cc847ae fix(play): address metadata review findings
955f614 fix(play): fully localize Turkish store screenshots
```

No fork is part of the approved delivery path. No current upstream PR exists at the time of this evidence capture.

## Upstream GitHub state

A read-only push dry-run against `MakerParsDev/Astroloji` was performed after the final implementation commits. It failed before any remote mutation because the active `MakerParsDev` GitHub CLI credential is invalid:

```text
remote: Invalid username or token.
push dry-run status: 128
```

Other locally configured GitHub accounts were not used as a fallback. The branch therefore remains local until `MakerParsDev` authentication is restored.

## Final local repository verification

Fresh verification on the final implementation tree:

- `node --test scripts/*.test.mjs`: **191/191 passed**.
- `node scripts/validate-play-metadata.mjs`: passed for exactly `en-US` and `tr-TR`.
- `node scripts/scan-secrets.mjs`: passed.
- `git diff --check`: passed before the final implementation commits.
- Backend `npm ci`: passed using the MSI user cache.
- Backend `npm audit --audit-level=high`: **0 vulnerabilities**.
- Backend main build: passed.
- Backend transition dry-run build: passed.
- Backend unit/integration tests: **192/192 passed**.
- Backend main runtime suite: **4/4 passed**.
- Backend transition runtime suite: **4/4 passed**.
- Android final implementation tree: `testDebugUnitTest`, Detekt, ktlint, `lintDebug`, screenshot validation, device-smoke APK/androidTest compilation, and debug APK assembly completed with **BUILD SUCCESSFUL**.
- CI-equivalent screenshot command `:app:validateDebugScreenshotTest -Pandroid.experimental.enableScreenshotTest=true -Pandroid.sync.suppressAgpWarnings=UNSUPPORTED_PROJECT_OPTION_USE`: **BUILD SUCCESSFUL**.
- Screenshot references: **17**.

The first manual screenshot invocation omitted the required experimental Gradle property, so the task did not exist. That invocation did not run tests and is not counted as evidence. The exact CI invocation above was then used successfully.

## Android artifacts

Current artifacts on MSI after final local verification:

```text
Astroloji/app/build/outputs/apk/debug/app-debug.apk
size: 33,924,265 bytes
SHA-256: db06ec7120d016ff882e39017b1ccd8521bb9f1d5bc57a6e0be560f023eec19d

Astroloji/device-smoke/build/outputs/apk/debug/device-smoke-debug.apk
size: 5,228,815 bytes
SHA-256: 7a8197d4bf30ba01582182b3ddd748a3ce4bc957c7460b65a93010a23a1ace1e

Astroloji/device-smoke/build/outputs/apk/androidTest/debug/device-smoke-debug-androidTest.apk
size: 1,738,067 bytes
SHA-256: 8b8204594341bda2cc5414afb49b46aa6f3e35d68cc8c356c9f3082b32910aff

Astroloji/app/build/outputs/bundle/release/app-release.aab
size: 15,911,512 bytes
SHA-256: 7130df58e6f0cfe488cbed95c27fcb55a8c7814a8c844618969ca77ec6bfda69
```

The release AAB was produced earlier in this branch with the normal release-signing material supplied through temporary mode-`0600` files; temporary signing files were removed after verification. The review-fix commits affect Play tooling, documentation, workflow safety, and screenshot-test assets rather than release application code.

## Canonical Play assets

`Astroloji/play/asset-manifest.json` currently binds exactly 15 Play assets:

| Locale | Role | Order | Size | SHA-256 | Path |
| --- | --- | ---: | --- | --- | --- |
| shared | icon | 0 | 512×512 | `abddb35850979c2d49e90e1a18663a6433c07d0385f033f9a0857fc34326d12e` | `shared/icon/icon.png` |
| en-US | featureGraphic | 0 | 1024×500 | `2297cfb7748510cea53db4a4e124002d8603ce7065e49100024f78497e59b262` | `en-US/featureGraphic/feature-graphic.png` |
| en-US | phoneScreenshot | 1 | 1080×1920 | `5cf22d12f091a446341c168e159edb814970c7c6c4ef077bfea43b9b57bbd405` | `en-US/phoneScreenshots/01-daily.png` |
| en-US | phoneScreenshot | 2 | 1080×1920 | `cfc1badf8ad08b713cc3aa717dde30d454edd64b064d008b2f2b15cebfb84285` | `en-US/phoneScreenshots/02-guidance.png` |
| en-US | phoneScreenshot | 3 | 1080×1920 | `99b945c7386fde0175ab44998b96c0d337014c34218b5b20154aa214739de68c` | `en-US/phoneScreenshots/03-compatibility.png` |
| en-US | phoneScreenshot | 4 | 1080×1920 | `e84472253258ac3aa9be4182f9a5f9693b8023d374cd3d9db5fbad9b007a3f5e` | `en-US/phoneScreenshots/04-personality.png` |
| en-US | phoneScreenshot | 5 | 1080×1920 | `c648deb6fc07a32429934d16093c9640a140ba8d0c8d03f6ccc234b7ee96b16d` | `en-US/phoneScreenshots/05-tools.png` |
| en-US | phoneScreenshot | 6 | 1080×1920 | `223eb1b5f9ba6acb9cfb96007201a96218659b7ab267a0b04a4aa83d2f34e817` | `en-US/phoneScreenshots/06-premium.png` |
| tr-TR | featureGraphic | 0 | 1024×500 | `f0ad4bb2b15a39a1f9cdae22b908e9204049637b3250153b868b43831f2c4b3d` | `tr-TR/featureGraphic/feature-graphic.png` |
| tr-TR | phoneScreenshot | 1 | 1080×1920 | `d2f1158d045fc0652e9e464018852a4d1f116324573f2ef8679d358cc8816641` | `tr-TR/phoneScreenshots/01-daily.png` |
| tr-TR | phoneScreenshot | 2 | 1080×1920 | `3adac1458b2130f3c3150a9317fff39705a8df2fcaa984fa4ab726a431efa841` | `tr-TR/phoneScreenshots/02-guidance.png` |
| tr-TR | phoneScreenshot | 3 | 1080×1920 | `574cbd42510d25b0d7f63b21af0968ff39cd8b87f01b67b2eddc92b0beb7e1e7` | `tr-TR/phoneScreenshots/03-compatibility.png` |
| tr-TR | phoneScreenshot | 4 | 1080×1920 | `08d5e8cd7126709c83306d7c2c8498e905ee2025bda3405c09b04fea0dda3284` | `tr-TR/phoneScreenshots/04-personality.png` |
| tr-TR | phoneScreenshot | 5 | 1080×1920 | `57ab34f0d7a3d45e7a31b359547163ee885df75038ee8547d994e4688adc8990` | `tr-TR/phoneScreenshots/05-tools.png` |
| tr-TR | phoneScreenshot | 6 | 1080×1920 | `dc25c966530f06261a8276b848dfeb7a5387afb57b10fd4d4ffd834d6b81d176` | `tr-TR/phoneScreenshots/06-premium.png` |

The Turkish screenshot fixture no longer mixes English scene labels into `tr-TR` previews, and locale-specific premium display strings now match their `priceAmountMicros` values. The asset manifest and exported PNG checksums were regenerated from the corrected goldens.

## Fresh live Play read-back after review fixes

Latest secret-safe backup:

```text
/home/msi/.local/state/astroloji/play-backups/play-task12-reviewfixed-20260807T053740Z.json
mode: 0600
SHA-256: 323d4addb3d370fbfb7045b46d7248598833f54744ccdea7373b9fe2c52221a4
defaultLocale: tr-TR
```

Live read-back:

```text
live listing locales: 86
canonical locales: 2 (en-US, tr-TR)
unsupported live locales: 84
missing supported locales: none
production rollout: 1.0 / completed
canonical metadata safety contract rollout: 0.1
subscriptions: premium_monthly/monthly, premium_weekly/weekly
read-back: blocked by design with 2 drift findings
```

The read-back opened no committed Play mutation. Metadata publication and unsupported-locale cleanup remain fail-closed because live production is already fully rolled out while the canonical metadata mutation guard deliberately expects a separately approved 10% release state.

## Backup / restore evidence

Historical secret-safe backups retained outside the repository:

```text
play-before-global-optimization-20260806T170556Z.json
SHA-256: 85d6ac4328b11a1c7ce0030265c491d86988b10f50235329ed6774f9bb736f1d

play-before-locale-cleanup-20260806T171159Z.json
SHA-256: 388809d154972b688f9a856661a3bea8e0d0b6155da5c9e2491fdd96ee15f322

play-task12-fresh-20260807T050159Z.json
SHA-256: 1ff103dbe9b5f0fca64879f693537b2517c01676470079cad5d9268ad19f9cbf

play-task12-reviewfixed-20260807T053740Z.json
SHA-256: 323d4addb3d370fbfb7045b46d7248598833f54744ccdea7373b9fe2c52221a4
```

The new backup schema persists the configured `defaultLocale` and requires valid image SHA-256 data before an apply restore can proceed. Legacy backups lacking the new invariants are rejected before an actionable restore confirmation is presented.

A dry-run against the latest backup produced a backup-bound restore confirmation, but no restore was executed because no live metadata publication occurred.

## Policy and measurement state

Canonical policy evidence requires:

```text
Account deletion: supported
Deletion URL: https://astrology.parsfilo.com/delete-account
Privacy policy: https://astrology.parsfilo.com/privacy
Ads: declared
```

Play Console UI-only Data Safety/account-deletion fields have not been changed by this branch. Those UI mutations remain intentionally separate from repository implementation and require exact live-page verification before save.

Canonical measurement baseline remains `docs/PLAY_STORE_BASELINE_2026-08-06.json` for `2026-07-04..2026-08-02`. Unavailable metrics remain `null` with explicit reasons; the tooling does not invent zero values.

## Review findings addressed

The automated review performed before the prior PR was removed identified one critical workflow-injection issue plus correctness/safety findings. Valid findings were reproduced with tests and fixed locally, including:

- workflow-dispatch inputs passed through `env:` rather than direct shell interpolation,
- dedicated repository-variable read-token contract for the post-mutation gate check,
- strict baseline metric field whitelisting and numeric/date validation,
- complete Turkish/English forbidden-claim validation,
- mandatory release-note root validation,
- canonical asset locale/role enforcement,
- explicit Play release selection instead of `releases[0]`,
- `uploadType=media` image upload semantics,
- missing-track handling and subscription pagination,
- explicit default locale in backups,
- strict image SHA-256 verification before publication/restore,
- post-commit error messages carrying the committed edit id and restore direction,
- shared fail-fast CLI argument parsing,
- release-note supported-locale filtering,
- Turkish store-scene localization and locale-correct premium price micros.

The resulting script/workflow test suite is **191/191 green**.

## Remaining gated actions

The following are intentionally incomplete:

1. Restore valid `MakerParsDev` GitHub authentication on MSI.
2. Push this branch directly to `MakerParsDev/Astroloji`.
3. Open a PR inside `MakerParsDev/Astroloji` and run fresh GitHub CI/review on the final commits.
4. Merge only after those checks are green.
5. Make a new post-merge Play backup and dry-run diff.
6. Resolve the separate live rollout `1.0` versus canonical mutation-guard `0.1` decision.
7. Publish the canonical Turkish/English metadata and 15 assets only after that guard is intentionally reconciled.
8. Perform independent post-publication read-back.
9. Remove 84 unsupported locales only through the state-bound cleanup flow.
10. Reconcile UI-only Play Data Safety/account-deletion settings and verify public propagation.
11. Mark the post-change measurement timestamp and compare a later observation window without claiming causation.

No Google Play metadata, locale cleanup, policy form, or rollout mutation was executed while completing this verification.
