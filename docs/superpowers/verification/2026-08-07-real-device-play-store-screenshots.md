# Real-Device Play Store Screenshot Verification Evidence

**Date:** 2026-08-07  
**Repository:** `MakerParsDev/Astroloji`  
**Branch:** `feat/real-device-play-store-screenshots-20260807`  
**Implementation HEAD verified before this evidence commit:** `51d992d2123a41504a5efc79e0de7386afa78258`  
**Base implementation ancestor:** `23f39c691803a5d5e771702230de8059e238b587`  
**Result:** Tasks 1–7 passed local implementation verification. No Play publication, rollout change, subscription mutation, or real purchase was performed during this evidence run.

## Scope and Identity

All implementation commits on this branch were authored and committed as `MakerParsDev`. The branch is intended for a same-repository pull request in `MakerParsDev/Astroloji`; no fork is part of the accepted flow.

The screenshot project changes only the phone screenshot publication path for the supported locales `en-US` and `tr-TR`. The controlled publisher requires the exact scope `phoneScreenshots`; listing text, icon, feature graphic, release notes, rollout, and subscription mutations are excluded from that path.

## Real Device and Package Isolation

Physical capture device: Redmi 5 Plus, ADB serial masked as `6bf2…0005`, physical framebuffer `1080x2160`.

Production package after capture:

- package: `com.parsfilo.astrology`
- versionCode: `1100`
- versionName: `1.0.100-smoke`
- signing certificate SHA-256: `7e4512d926e4…e6972d46`

QA package after capture:

- package: `com.parsfilo.astrology.storeqa`
- versionCode: `1`
- versionName: `1.0-storeqa`

The capture runner snapshots the production package version/signature before and after each QA capture and fails closed if they differ. The final Turkish and English capture runs both exited successfully. Production was not cleared, uninstalled, re-signed, or replaced by the QA APK.

## QA Firebase Isolation

The QA Firebase Android registration uses package `com.parsfilo.astrology.storeqa`. Real machine-local Firebase configuration is ignored by Git. The tracked fallback is a sanitized `google-services.example.json`, and the repository secret scan remains strict.

Verification after history cleanup proved:

- `node scripts/scan-secrets.mjs`: passed
- reachable branch commits containing a Google API key in the storeQa config paths: `0`
- `:app:assembleStoreQa` with only the sanitized fallback: passed
- generated APK application ID: `com.parsfilo.astrology.storeqa`

The real capture APK SHA-256 was:

```text
152025659ca93a0a0e6d05efb6e3bf10e3b805a052ded32eb7660098386d1ec3
```

A later verification-only placeholder build has a different local APK digest by design and is not the APK used for the recorded real-device captures.

## Raw Real-Device Capture Hashes

All 12 raw device captures are `1080x2160` PNG files.

| Raw capture | SHA-256 |
|---|---|
| `store_capture_en_compatibility.png` | `4f6f5ca4717e7b490a21437c650c17de159a6b35bca31928d346697c51c8a7a4` |
| `store_capture_en_daily.png` | `e239b0ddc130904ba5a109a0b217fb7e6185e0fe32fd1d4dbd249a0f9c3d745a` |
| `store_capture_en_monthly.png` | `3b295b98f6011533e0fa640a565732dc90d4c6ccda1e5bbb6d3109cdd7ad7356` |
| `store_capture_en_premium.png` | `6fd14c26268877cd6b5d1abf94a5fe7cdb100631859da1f86222d14390280776` |
| `store_capture_en_profile.png` | `5f028befd4078985d151dfbff8f0b9fd8c6a624438de73e59dffd3358ba2b4ce` |
| `store_capture_en_weekly.png` | `80e9c6492b0ef3f6701375445519c676fa465cf20c9b8f511ded86df3c001589` |
| `store_capture_tr_compatibility.png` | `53983606ff4e9e8f9eb3929fb4d55082a3b6e7991501e0fbf24f731fb5762ab9` |
| `store_capture_tr_daily.png` | `bd633f9ef5871bd5bf2c4772def737354162840033ae267b4564071c7bc191be` |
| `store_capture_tr_monthly.png` | `326f6f37ef81fbff73bec3701906472e799dc94346761510a1cca697670d782e` |
| `store_capture_tr_premium.png` | `0cacb4f997bbed79ddc33713720513d6aafe118720fec15ce7299b404a678845` |
| `store_capture_tr_profile.png` | `92bd147f835f464e65e27260c206ac5fa56f96fe3c846d1e20c2dd000f19e11a` |
| `store_capture_tr_weekly.png` | `2fddabcb1a657fcc52c4810d22c244fd71aa723ebc4f9a1fc374c7c59bd4240e` |

## Final Play Phone Screenshot Hashes

All 12 final phone screenshots are `1080x2400` PNG files.

| Final asset | SHA-256 |
|---|---|
| `Astroloji/play/assets/en-US/phoneScreenshots/01-daily.png` | `fc13dbc2a2dc978ff3397d87657317188214ff6b222d159b9b3cdec6d8019ccf` |
| `Astroloji/play/assets/en-US/phoneScreenshots/02-weekly.png` | `7a2fabd83d2e6e57389f0129edd889448b3686808db9714e68984dc073b51b18` |
| `Astroloji/play/assets/en-US/phoneScreenshots/03-monthly.png` | `26c9126176f07d16fdfe59b473a81eff42b635212737763f7ef79a102a9d810d` |
| `Astroloji/play/assets/en-US/phoneScreenshots/04-compatibility.png` | `e3c4f880579bd403f0d09bdb09698940213f6ed1fa98260dda078c4e4ebfd9c8` |
| `Astroloji/play/assets/en-US/phoneScreenshots/05-profile.png` | `6e17591d78e40f5ba73222482c91a55c9bd419d0b7da6c1e93ce7f22e9044aa0` |
| `Astroloji/play/assets/en-US/phoneScreenshots/06-premium.png` | `9e42268da817feb600327a5495d8515a2bcbcc1b757fd0430797218b73a8b7f2` |
| `Astroloji/play/assets/tr-TR/phoneScreenshots/01-daily.png` | `64587762cea81fafaf7ee0e528a6f2950abbc6a42aa3745b54e7726ca4a9e89d` |
| `Astroloji/play/assets/tr-TR/phoneScreenshots/02-weekly.png` | `811df5f5038eaf4f36d14a0a1e12ce9f9f8f5d1228c6285ae30dc72b9c3a196f` |
| `Astroloji/play/assets/tr-TR/phoneScreenshots/03-monthly.png` | `a19b7f937f61bba7f7e07ba8672f60432cbea80cf6dbf9d2f1053583b7e9a027` |
| `Astroloji/play/assets/tr-TR/phoneScreenshots/04-compatibility.png` | `8bd67d42a05ee86fc858825c61af776dc5caca7d25d5c748bae9feab2e6da6c0` |
| `Astroloji/play/assets/tr-TR/phoneScreenshots/05-profile.png` | `e8e7617da045706716047c5e5d8c136dd4753cff21909aab12097c168a560158` |
| `Astroloji/play/assets/tr-TR/phoneScreenshots/06-premium.png` | `467c3cad0e4bb4973f9578d9723a9955f2ebac8bfd555ff0362bb1dcfe84c0ff` |

## Stable Non-Phone Asset Hashes

The canonical export preserved the non-phone assets byte-for-byte:

```text
shared icon
abddb35850979c2d49e90e1a18663a6433c07d0385f033f9a0857fc34326d12e

en-US feature graphic
2297cfb7748510cea53db4a4e124002d8603ce7065e49100024f78497e59b262

tr-TR feature graphic
f0ad4bb2b15a39a1f9cdae22b908e9204049637b3250153b868b43831f2c4b3d
```

## Automated Verification on Implementation HEAD

Repository-root verification on `51d992d2123a41504a5efc79e0de7386afa78258`:

```bash
node --test scripts/*.test.mjs
node scripts/validate-play-metadata.mjs
node scripts/scan-secrets.mjs
/usr/local/bin/actionlint .github/workflows/*.yml
git diff --check
```

Windows/PowerShell operator equivalent (not part of the historical MSI execution above):

```powershell
Set-Location <repo-root>
node --test scripts/*.test.mjs
node scripts/validate-play-metadata.mjs
node scripts/scan-secrets.mjs
Get-ChildItem .github/workflows -Filter *.yml | ForEach-Object { actionlint $_.FullName }
git diff --check
```

Result:

- Node release/tooling/contract tests: **246 passed, 0 failed**
- Play metadata: **2 supported locales passed** (`en-US`, `tr-TR`)
- secret scan: passed
- actionlint: passed
- `git diff --check`: passed

Android verification used Java 21, the configured Android SDK, 3 GiB Gradle heap, two workers, screenshot-test enablement, and sanitized Google Services fallbacks:

```bash
cd Astroloji
GRADLE_USER_HOME=/home/msi/.gradle bash ./gradlew \
  :app:testDebugUnitTest \
  detekt \
  ktlintCheck \
  lint \
  :app:assembleDebug \
  :app:assembleStoreQa \
  :app:compileDebugAndroidTestKotlin \
  -Pandroid.experimental.enableScreenshotTest=true \
  :app:validateDebugScreenshotTest
```

Result: **BUILD SUCCESSFUL in 1m 23s**, 186 actionable tasks, 12 executed and 174 up-to-date. This gate includes unit tests, Detekt, ktlint, Android Lint, debug APK, isolated storeQa APK, Android instrumentation-test compilation, and Compose screenshot pixel validation.

Windows/PowerShell operator equivalent for a Windows checkout uses the Windows Gradle wrapper and local Android SDK path:

```powershell
Set-Location <repo-root>\Astroloji
$env:ANDROID_HOME = '<path-to-Android-Sdk>'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:GRADLE_USER_HOME = Join-Path $HOME '.gradle'
$env:GRADLE_OPTS = '-Dorg.gradle.jvmargs=-Xmx3g -XX:MaxMetaspaceSize=768m -Dfile.encoding=UTF-8 -Dorg.gradle.workers.max=2'
.\gradlew.bat `
  :app:testDebugUnitTest `
  detekt `
  ktlintCheck `
  lint `
  :app:assembleDebug `
  :app:assembleStoreQa `
  :app:compileDebugAndroidTestKotlin `
  -Pandroid.experimental.enableScreenshotTest=true `
  :app:validateDebugScreenshotTest
```


## Human Visual QA

The 12 final phone screenshots were reviewed at both full `1080x2400` size and a `180px`-wide two-row thumbnail contact sheet.

Acceptance result:

- all six scenes are visually distinct in both locales;
- headlines remain readable at carousel-thumbnail scale;
- device content is large enough to inspect without synthetic UI reconstruction;
- Turkish captures contain Turkish UI/content and English captures contain English UI/content;
- no loading state, permission prompt, crash dialog, toast, interstitial, app-open ad, or purchase-confirmation dialog is present;
- the Premium scene shows deterministic monthly + weekly QA offers only;
- no personal account identifier or device identifier is visible in the final images.

## Purchase and Production Safety

No real purchase occurred. QA purchase and restore entry points fail closed before BillingClient purchase execution. The Premium capture used deterministic QA catalogue data only.

No action in Tasks 1–7 changed production Play state:

- no rollout was started, stopped, or modified;
- no subscription product or base plan was changed;
- no listing text was published;
- no icon or feature graphic was published;
- no Play phone screenshot mutation was sent yet.

## Remaining Gated Steps

The following Task 8 steps remain after this evidence commit:

1. Re-run the full verification suite on the exact documentation-inclusive PR head.
2. Fetch current `origin/main`, verify branch ancestry, and push only to `MakerParsDev/Astroloji`.
3. Open a same-repository PR and require fresh exact-head CI and CodeRabbit review.
4. Merge only the exact reviewed head.
5. Take a fresh pre-publication Play backup and prove the diff changes only `phoneScreenshots` for `en-US` and `tr-TR`.
6. Publish with exact scope `--image-scope phoneScreenshots` under the existing run-bound authorization model.
7. Perform independent read-back and a second Play backup; confirm listing text, icon, feature graphic, rollout, and monthly+weekly subscriptions remain unchanged.
8. Inspect the propagated public Turkish and English Play carousel thumbnails.

Data Safety/account-deletion policy validation is a separate workstream and is not claimed as part of this screenshot-only verification.
