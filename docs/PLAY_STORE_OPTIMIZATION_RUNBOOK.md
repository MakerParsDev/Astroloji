# Google Play Store Optimization Runbook

**Package:** `com.parsfilo.astrology`  
**Supported store locales:** `en-US`, `tr-TR`  
**Canonical source:** `Astroloji/play/`  
**Production mutation authorization:** `ENABLE_METADATA_PUBLISH` remains `false`. GitHub mutation jobs require an exact workflow run ID in `METADATA_PUBLISH_AUTH_RUN_ID` plus `METADATA_PUBLISH_AUTH_EXPIRES_AT_EPOCH` no more than 300 seconds in the future; both are closed immediately after authorization.


## Run-scoped GitHub mutation authorization

Production metadata writes are authorized only after the workflow has been dispatched and its exact workflow run ID is known. `ENABLE_METADATA_PUBLISH` is a legacy defense-in-depth variable and must remain `false`; it no longer grants mutation authority. The workflow accepts only an authorization whose `METADATA_PUBLISH_AUTH_RUN_ID` equals its exact `github.run_id` and whose expiry is positive and at most **300 seconds (5 minutes)** away.

On MSI Ubuntu, install cleanup before writing authorization variables:

```bash
close_metadata_authorization() {
  gh variable set METADATA_PUBLISH_AUTH_RUN_ID --repo MakerParsDev/Astroloji --body disabled
  gh variable set METADATA_PUBLISH_AUTH_EXPIRES_AT_EPOCH --repo MakerParsDev/Astroloji --body 0
  gh variable set ENABLE_METADATA_PUBLISH --repo MakerParsDev/Astroloji --body false
}
trap close_metadata_authorization EXIT INT TERM

# Dispatch first and discover the exact new workflow run ID.
# Then authorize only that run for <= 300 seconds:
gh variable set METADATA_PUBLISH_AUTH_RUN_ID --repo MakerParsDev/Astroloji --body "$RUN_ID"
gh variable set METADATA_PUBLISH_AUTH_EXPIRES_AT_EPOCH --repo MakerParsDev/Astroloji --body "$(( $(date +%s) + 300 ))"

# After authorize-mutation succeeds and play-mutation starts:
close_metadata_authorization
trap - EXIT INT TERM
```

A dispatch failure happens before authorization is written. Job-start failure, cancellation, operator interruption, timeout, and success all execute the closure path. Even if the operator host crashes before cleanup, the exact-run match prevents reuse by another workflow run and the authorization expires within five minutes. The workflow's final job independently requires `METADATA_PUBLISH_AUTH_RUN_ID=disabled`, `METADATA_PUBLISH_AUTH_EXPIRES_AT_EPOCH=0`, and `ENABLE_METADATA_PUBLISH=false`.

## Safety model

Text/image publication, unsupported-locale cleanup, policy-form changes, and rollout changes are separate operations. Never combine them in one Play edit or one approval.

Every text/image publication requires:

1. a fresh full backup outside the repository,
2. the backup file SHA-256,
3. a JSON dry-run diff,
4. exact `PUBLISH_TR_EN_METADATA_<backup-sha-prefix>` confirmation,
5. edit-local text/image read-back before commit,
6. independent read-back after commit.

Every locale cleanup additionally requires:

1. a fresh backup whose state digest matches the current live state,
2. both supported locales present,
3. exact frozen removal count,
4. production rollout matching `Astroloji/play/store-config.json`,
5. exact `REMOVE_<count>_UNSUPPORTED_PLAY_LOCALES_<state-digest-prefix>` confirmation,
6. an edit containing exactly `en-US` and `tr-TR` before commit,
7. independent verification that exactly those two locales remain.

## Historical pre-decision blocker evidence — 2026-08-06

The latest read-only cleanup dry-run produced:

```text
Backup path: /home/msi/.local/state/astroloji/play-backups/play-before-locale-cleanup-20260806T171159Z.json
Backup SHA-256: 388809d154972b688f9a856661a3bea8e0d0b6155da5c9e2491fdd96ee15f322
Live state SHA-256: dea8006d3934e15768d6427a7203f36ab016f30f0b392e487fb69204e9a1d49a
Live locale count: 86
Supported locale count: 2
Frozen removal count: 84
Production rollout: 1.0 (completed)
Expected rollout: 0.1
Result: blocked before cleanup edit creation
```

No destructive confirmation was generated because the rollout contract does not match. Do not construct a confirmation manually and do not bypass the guard.

This snapshot is historical. On 2026-08-07 the operator explicitly selected approach A, keeping production at `1.0` and changing the metadata safety precondition to `1.0`. The historical `0.1` blocker must not be reused for a current mutation plan.

The backup is mode `0600` in a mode `0700` directory. It contains listing text, image metadata, track metadata, and subscription identifiers; it contains no access token, service-account key, or tester identity.

## Validate repository metadata

```bash
node scripts/validate-play-metadata.mjs
node --test \
  scripts/play-store-config.test.mjs \
  scripts/play-copy-quality.test.mjs \
  scripts/play-assets.test.mjs \
  scripts/play-diff.test.mjs \
  scripts/play-publication.test.mjs \
  scripts/play-locale-cleanup.test.mjs
node scripts/scan-secrets.mjs
```

## Create a fresh live backup

Run through the approved workflow whenever possible. For direct operator recovery, create a temporary mode-`0600` service-account file, never print it, and remove it with a shell trap.

```bash
PLAY_PACKAGE_NAME=com.parsfilo.astrology \
PLAY_SERVICE_ACCOUNT_JSON_PATH=/absolute/private/play-service-account.json \
node scripts/backup-play-metadata.mjs \
  --output /home/msi/.local/state/astroloji/play-backups/play-before-operation-<UTC>.json
```

Record:

```bash
sha256sum /home/msi/.local/state/astroloji/play-backups/play-before-operation-<UTC>.json
```

Backups used for publication or cleanup must be fresh within the configured 30-minute window.

## Produce the text/image dry-run diff

```bash
node scripts/diff-play-metadata.mjs \
  --backup /absolute/private/play-backup.json \
  --expected-root /absolute/path/to/merged/repository
```

The command writes `/absolute/private/play-backup.json.diff.json` with mode `0600`. Publication is blocked when production rollout or subscription products differ from canonical source control.

Reconfirm the approved backup against fresh live Play state immediately before any publication attempt, then run the independent read-back. Both commands are read-only and remain ungated:

```bash
PLAY_PACKAGE_NAME=com.parsfilo.astrology \
PLAY_SERVICE_ACCOUNT_JSON_PATH=/absolute/private/play-service-account.json \
node scripts/verify-play-backup-current.mjs \
  --backup /absolute/private/play-backup.json

PLAY_PACKAGE_NAME=com.parsfilo.astrology \
PLAY_SERVICE_ACCOUNT_JSON_PATH=/absolute/private/play-service-account.json \
node scripts/readback-play-metadata.mjs \
  --expected-root /absolute/path/to/merged/repository
```

Any future production rollout drift from the approved `1.0` contract makes read-back fail by design; that failure is evidence, not a reason to bypass the guard.

The publication command must not be run until the dry-run has no blockers:

```bash
PLAY_PACKAGE_NAME=com.parsfilo.astrology \
PLAY_SERVICE_ACCOUNT_JSON_PATH=/absolute/private/play-service-account.json \
node scripts/publish-play-metadata.mjs \
  --backup /absolute/private/play-backup.json \
  --confirmation PUBLISH_TR_EN_METADATA_<exact-backup-sha-prefix>
```

This command updates only the supported Turkish/English listing text and their canonical images. It does not delete unsupported listing locales.

## Unsupported-locale cleanup dry-run

Run cleanup only after Turkish/English text and images have passed independent read-back. Capture a new backup after that publication.

```bash
PLAY_PACKAGE_NAME=com.parsfilo.astrology \
PLAY_SERVICE_ACCOUNT_JSON_PATH=/absolute/private/play-service-account.json \
node scripts/cleanup-play-locales.mjs \
  --backup /absolute/private/fresh-pre-cleanup-backup.json
```

A valid unblocked dry-run prints all locales to remove and these four bound values:

```text
CLEANUP BACKUP SHA256
CLEANUP LIVE STATE SHA256
CLEANUP REMOVAL COUNT
REQUIRED CONFIRMATION
```

Apply only by copying all four values exactly:

```bash
PLAY_PACKAGE_NAME=com.parsfilo.astrology \
PLAY_SERVICE_ACCOUNT_JSON_PATH=/absolute/private/play-service-account.json \
node scripts/cleanup-play-locales.mjs \
  --backup /absolute/private/fresh-pre-cleanup-backup.json \
  --backup-sha256 <exact-64-character-backup-sha256> \
  --state-digest <exact-64-character-live-state-sha256> \
  --removal-count <exact-count> \
  --confirmation REMOVE_<exact-count>_UNSUPPORTED_PLAY_LOCALES_<exact-state-prefix>
```

The tool re-reads live state before applying. Any state, count, package, supported-locale, backup, subscription, or rollout drift invalidates the plan.

## Rollback dry-run and restore

Guarded restore now requires a backup that explicitly records canonical `defaultLocale` and valid SHA-256 metadata for every backed-up image. Older pre-review backups remain historical evidence but are intentionally rejected for restore apply.

Current restore-capable fresh backup:

```text
/home/msi/.local/state/astroloji/play-backups/play-task12-reviewfixed-20260807T053740Z.json
SHA-256: 323d4addb3d370fbfb7045b46d7248598833f54744ccdea7373b9fe2c52221a4
mode: 0600
defaultLocale: tr-TR
```

Inspect its exact restore plan without mutation:

```bash
PLAY_PACKAGE_NAME=com.parsfilo.astrology \
node scripts/restore-play-metadata.mjs \
  --backup /home/msi/.local/state/astroloji/play-backups/play-task12-reviewfixed-20260807T053740Z.json
```

The dry-run validates backup restore invariants before printing any actionable confirmation. Apply is permitted only after separately verifying the SHA-256 above and supplying the exact backup-derived confirmation:

```bash
PLAY_PACKAGE_NAME=com.parsfilo.astrology \
PLAY_SERVICE_ACCOUNT_JSON_PATH=/absolute/private/play-service-account.json \
node scripts/restore-play-metadata.mjs \
  --backup /home/msi/.local/state/astroloji/play-backups/play-task12-reviewfixed-20260807T053740Z.json \
  --confirmation RESTORE_PLAY_METADATA_323d4addb3d3
```

No restore has been executed because no live metadata publication has occurred. Restore reconstructs listing text and backed-up image slots in a new edit, verifies the edit, commits with `ERROR_IF_IN_REVIEW`, and performs an independent read-back. Do not restore merely to bypass a current rollout or locale-cleanup blocker.

Historical backups such as `play-before-locale-cleanup-20260806T171159Z.json` predate the explicit `defaultLocale` restore invariant and are retained only as audit evidence.

## Windows PowerShell operator equivalents

The production operator host is MSI Ubuntu, so the Bash commands above are canonical for live execution. On Windows, use PowerShell syntax rather than translating Bash line continuations. Read-only direct CLI commands remain ungated. Direct recovery commands rely on their digest-bound confirmations and state checks; the GitHub workflow uses the separate exact-run authorization above.

For any direct recovery session, create the credential outside the repository and delete it in `finally`. Populate it from the approved secret manager without printing its contents, then execute the selected command(s) from the examples below inside the `try` body:

```powershell
$env:PLAY_PACKAGE_NAME = 'com.parsfilo.astrology'
$credentialPath = Join-Path ([IO.Path]::GetTempPath()) ("astro-play-" + [guid]::NewGuid().ToString('N') + '.json')
$env:PLAY_SERVICE_ACCOUNT_JSON_PATH = $credentialPath
try {
  # Populate $credentialPath from the approved secret manager without printing it.
  # Execute the selected read-only or recovery command(s) below before leaving this block.
  Get-Item $credentialPath | Out-Null
} finally {
  Remove-Item -Force $credentialPath -ErrorAction SilentlyContinue
  Remove-Item Env:PLAY_SERVICE_ACCOUNT_JSON_PATH -ErrorAction SilentlyContinue
}
```

Read-only backup, checksum, diff, fresh-state verification, and read-back:

```powershell
node scripts/backup-play-metadata.mjs --output 'C:\private\play-before-operation.json'
(Get-FileHash 'C:\private\play-before-operation.json' -Algorithm SHA256).Hash.ToLowerInvariant()
node scripts/diff-play-metadata.mjs --backup 'C:\private\play-before-operation.json' --expected-root $PWD.Path
node scripts/verify-play-backup-current.mjs --backup 'C:\private\play-before-operation.json'
node scripts/readback-play-metadata.mjs --expected-root $PWD.Path
```

Publication apply:

```powershell
node scripts/publish-play-metadata.mjs --backup 'C:\private\play-before-operation.json' --confirmation 'PUBLISH_TR_EN_METADATA_<exact-backup-sha-prefix>'
if ($LASTEXITCODE -ne 0) { throw "Play metadata publication failed with exit code $LASTEXITCODE." }
```

Locale cleanup dry-run remains read-only:

```powershell
node scripts/cleanup-play-locales.mjs --backup 'C:\private\fresh-pre-cleanup-backup.json'
```

Locale cleanup apply:

```powershell
node scripts/cleanup-play-locales.mjs --backup 'C:\private\fresh-pre-cleanup-backup.json' --backup-sha256 '<exact-64-character-backup-sha256>' --state-digest '<exact-64-character-live-state-sha256>' --removal-count '<exact-count>' --confirmation 'REMOVE_<exact-count>_UNSUPPORTED_PLAY_LOCALES_<exact-state-prefix>'
if ($LASTEXITCODE -ne 0) { throw "Play locale cleanup failed with exit code $LASTEXITCODE." }
```

Restore dry-run remains read-only:

```powershell
node scripts/restore-play-metadata.mjs --backup 'C:\private\play-backup.json'
```

Restore apply:

```powershell
node scripts/restore-play-metadata.mjs --backup 'C:\private\play-backup.json' --confirmation 'RESTORE_PLAY_METADATA_<exact-backup-sha-prefix>'
if ($LASTEXITCODE -ne 0) { throw "Play metadata restore failed with exit code $LASTEXITCODE." }
```

Never persist the service-account JSON in the repository or PowerShell history. Prefer the guarded GitHub workflow over direct operator apply.

## Policy forms

Data Safety, account deletion, app access, target audience, content rating, support identity, and other UI-only forms follow `docs/PLAY_POLICY_ANSWER_SET_2026.md`.

1. Capture a read-only Play Console snapshot.
2. Compare current answers with the exact answer set and shipped artifact.
3. Create a state-bound high-impact browser action plan.
4. Save only after separate approval for the exact current page state.
5. Stop without saving when the DOM/state digest changes.
6. Verify the public listing after Play review and propagation.

## Rollout governance

Metadata tools never change production rollout. The production release is completed at `1.0`, and the explicitly approved metadata safety contract now requires that same `1.0` live state. Any rollout value other than `1.0` blocks publication and cleanup. This field is a read-only precondition for metadata operations; changing it never updates a Play track.

## Evidence and cleanup

After every operation, record only redacted evidence:

- merged commit and PR,
- backup path and SHA-256,
- dry-run diff summary,
- workflow run ID,
- supported locale count,
- image counts,
- production version/status/rollout,
- subscription product/base-plan pairs,
- rollback command,
- propagation or inaccessible-field notes.

Never commit or print service-account JSON, access tokens, tester identities, private backup contents, or browser screenshots containing account information.

## Measurement baseline

The canonical pre-publication measurement baseline is:

```text
docs/PLAY_STORE_BASELINE_2026-08-06.json
window: 2026-07-04..2026-08-02
captured: 2026-08-07T04:07:40Z
```

Interpretation rules are in `docs/PLAY_STORE_MEASUREMENT.md`.

Observed live baseline facts include production rollout `1.0`, backend paywall views `0`, purchase starts `0`, distinct verified purchase tokens `0`, and Astroloji AdMob aggregates `202` requests / `154` matched requests / `22` impressions. GA4 app-specific usage and Play ratings/reviews/crash/ANR remain unavailable in this baseline because the available sources did not provide a proven app-isolated or successful value. Do not replace those nulls with zero.

Metadata publication does not establish causation. After any successful store publication, mark the propagation timestamp and compare a comparable 30-day observation window. Do not combine that comparison with a rollout mutation. The approved live-state contract is now `1.0`; guarded metadata publication and locale cleanup may proceed only while fresh Play read-back still reports production at `1.0`.
