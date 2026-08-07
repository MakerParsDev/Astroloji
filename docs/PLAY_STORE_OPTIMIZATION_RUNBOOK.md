# Google Play Store Optimization Runbook

**Package:** `com.parsfilo.astrology`  
**Supported store locales:** `en-US`, `tr-TR`  
**Canonical source:** `Astroloji/play/`  
**Production mutation authorization:** `ENABLE_METADATA_PUBLISH` remains `false`. GitHub mutation jobs require a unique commit-status context `metadata-auth/<correlation>` on the exact merged `main` SHA. The status authorizes one exact workflow run for at most 300 seconds, then the same context is replaced with `closed run=<run-id>`. No long-lived GitHub PAT secret is required by the workflow.


## Run-scoped GitHub mutation authorization

Production metadata writes are authorized only after a workflow is dispatched with a unique immutable `authorization_correlation` UUID and the exact run is deterministically identified. `ENABLE_METADATA_PUBLISH` is a legacy defense-in-depth variable and must remain `false`; it never grants mutation authority. Authorization is carried by a unique commit-status context `metadata-auth/$CORRELATION` on the exact merged `main` SHA. The workflow reads that status with its short-lived `${{ github.token }}` and `statuses: read`; no additional long-lived GitHub read-token secret is required.

Generate one UUID correlation and freeze the current merged `main` SHA before dispatch. Pass the correlation as an immutable workflow input. The workflow `run-name` embeds both mode and correlation:

```bash
MODE=publish
CORRELATION="$(python3 -c 'import uuid; print(uuid.uuid4())')"
EXPECTED_HEAD_SHA="$(gh api repos/MakerParsDev/Astroloji/commits/main --jq '.sha')"
STATUS_CONTEXT="metadata-auth/$CORRELATION"

gh workflow run android-metadata.yml \
  --repo MakerParsDev/Astroloji \
  --ref main \
  -f mode="$MODE" \
  -f backup_run_id="$BACKUP_RUN_ID" \
  -f backup_sha256="$BACKUP_SHA256" \
  -f confirmation="$CONFIRMATION" \
  -f authorization_correlation="$CORRELATION"
```

Before posting any authorization status, select **exactly one** `workflow_dispatch` run. Reject zero or multiple matches. The canonical repository endpoint fixes repository identity; poll until the unique match is visible and verify `main`, exact head SHA, event, mode, and immutable correlation. Mode and correlation are encoded in `display_title` by `run-name`:

```bash
EXPECTED_TITLE="android-metadata-${MODE}-${CORRELATION}"
for attempt in $(seq 1 30); do
  RUN_ROWS="$(gh api \
    'repos/MakerParsDev/Astroloji/actions/workflows/android-metadata.yml/runs?event=workflow_dispatch&branch=main&per_page=100' \
    --jq '.workflow_runs[] | select(.event == "workflow_dispatch" and .head_branch == "main") | [.id,.head_sha,.display_title] | @tsv')"
  mapfile -t MATCHES < <(printf '%s\n' "$RUN_ROWS" | awk -F '\t' -v sha="$EXPECTED_HEAD_SHA" -v title="$EXPECTED_TITLE" '$2 == sha && $3 == title {print $1}')
  [ "${#MATCHES[@]}" -eq 1 ] && break
  [ "${#MATCHES[@]}" -gt 1 ] && { echo 'Ambiguous correlated metadata workflow runs.' >&2; exit 1; }
  sleep 2
done
if [ "${#MATCHES[@]}" -ne 1 ]; then
  echo "Expected exactly one correlated metadata workflow run; found ${#MATCHES[@]}." >&2
  exit 1
fi
RUN_ID="${MATCHES[0]}"
RUN_URL="https://github.com/MakerParsDev/Astroloji/actions/runs/$RUN_ID"
RUN_JSON="$(gh api "repos/MakerParsDev/Astroloji/actions/runs/$RUN_ID")"
test "$(jq -r '.event' <<<"$RUN_JSON")" = workflow_dispatch
test "$(jq -r '.head_branch' <<<"$RUN_JSON")" = main
test "$(jq -r '.head_sha' <<<"$RUN_JSON")" = "$EXPECTED_HEAD_SHA"
test "$(jq -r '.display_title' <<<"$RUN_JSON")" = "$EXPECTED_TITLE"
test "$(jq -r '.actor.login' <<<"$RUN_JSON")" = MakerParsDev
```

Install closure before posting authorization. The closure attempts both the `closed run=<id>` status and the legacy gate reset, returns failure if either write fails, and remains trapped until a successful explicit close:

```bash
close_metadata_authorization() {
  local rc=0
  gh api --method POST \
    "repos/MakerParsDev/Astroloji/statuses/$EXPECTED_HEAD_SHA" \
    -f state=success \
    -f context="$STATUS_CONTEXT" \
    -f description="closed run=$RUN_ID" \
    -f target_url="$RUN_URL" >/dev/null || rc=1
  gh variable set ENABLE_METADATA_PUBLISH --repo MakerParsDev/Astroloji --body false || rc=1
  return "$rc"
}
trap 'close_metadata_authorization || true' EXIT INT TERM
```

Only after the exact run match is proven, authorize that exact run for at most five minutes. The status creator must be `MakerParsDev`, and the target URL binds the status to the exact Actions run:

```bash
EXPIRES_AT="$(( $(date +%s) + 300 ))"
gh api --method POST \
  "repos/MakerParsDev/Astroloji/statuses/$EXPECTED_HEAD_SHA" \
  -f state=success \
  -f context="$STATUS_CONTEXT" \
  -f description="authorized run=$RUN_ID;exp=$EXPIRES_AT" \
  -f target_url="$RUN_URL" >/dev/null
```

After `authorize-mutation` succeeds and `play-mutation` starts, close authorization immediately. Keep the trap installed on cleanup failure so the EXIT path retries the same status closure:

```bash
if close_metadata_authorization; then
  trap - EXIT INT TERM
else
  echo 'Failed to close metadata authorization; leaving cleanup trap installed.' >&2
  exit 1
fi
```

A dispatch failure occurs before authorization is posted. Job-start failure, cancellation, operator interruption, timeout, and success all retain a closure path. Even if the operator host crashes after posting `authorized run=...`, the unique context cannot authorize another correlation/run and the embedded expiry is accepted only for five minutes. The workflow final verifier independently requires the latest exact context to be `success`, description `closed run=<exact-run-id>`, creator `MakerParsDev`, and target URL equal to that exact workflow run. `ENABLE_METADATA_PUBLISH` must remain `false` throughout.

On Windows PowerShell, post the same `metadata-auth/$Correlation` status inside `try`; in `finally`, post `closed run=$RunId` to the same context/target URL and set `ENABLE_METADATA_PUBLISH=false`. Do not rely on process exit for closure.

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

For any direct recovery session, create the credential outside the repository and delete it in `finally`. On Windows, create the empty file first, disable inherited NTFS ACLs, grant `Allow` only to the current user, apply the ACL, and verify that no non-owner `Allow` entry exists **before writing or reading secret material**:

```powershell
$env:PLAY_PACKAGE_NAME = 'com.parsfilo.astrology'
$credentialPath = Join-Path ([IO.Path]::GetTempPath()) ("astro-play-" + [guid]::NewGuid().ToString('N') + '.json')
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
New-Item -ItemType File -Path $credentialPath -Force | Out-Null
$acl = New-Object Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object Security.AccessControl.FileSystemAccessRule($currentUser, 'FullControl', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -Path $credentialPath -AclObject $acl
$verifiedAcl = Get-Acl -Path $credentialPath
$unsafeAllows = @($verifiedAcl.Access | Where-Object { $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -ne $currentUser })
if ($unsafeAllows.Count -ne 0) { throw 'Temporary Play credential ACL is not owner-only.' }
$env:PLAY_SERVICE_ACCOUNT_JSON_PATH = $credentialPath
try {
  # Populate the already ACL-hardened file from the approved secret manager without printing it.
  # Execute the selected read-only or recovery command(s) below before leaving this block.
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
