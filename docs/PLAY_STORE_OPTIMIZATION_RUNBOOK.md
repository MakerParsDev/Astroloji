# Google Play Store Optimization Runbook

**Package:** `com.parsfilo.astrology`  
**Supported store locales:** `en-US`, `tr-TR`  
**Canonical source:** `Astroloji/play/`  
**Production mutation gate:** `ENABLE_METADATA_PUBLISH` must be `true` only for an approved publication window and must return to `false` immediately afterward.

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

## Current live blocker evidence — 2026-08-06

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

For the current blocked cleanup evidence, inspect the exact restore plan without mutation:

```bash
PLAY_PACKAGE_NAME=com.parsfilo.astrology \
PLAY_SERVICE_ACCOUNT_JSON_PATH=/absolute/private/play-service-account.json \
node scripts/restore-play-metadata.mjs \
  --backup /home/msi/.local/state/astroloji/play-backups/play-before-locale-cleanup-20260806T171159Z.json
```

The command prints the exact backup-bound confirmation. Apply only after verifying the backup SHA-256 is still:

```text
388809d154972b688f9a856661a3bea8e0d0b6155da5c9e2491fdd96ee15f322
```

Then use:

```bash
PLAY_PACKAGE_NAME=com.parsfilo.astrology \
PLAY_SERVICE_ACCOUNT_JSON_PATH=/absolute/private/play-service-account.json \
node scripts/restore-play-metadata.mjs \
  --backup /home/msi/.local/state/astroloji/play-backups/play-before-locale-cleanup-20260806T171159Z.json \
  --confirmation RESTORE_PLAY_METADATA_388809d15497
```

Restore reconstructs listing text and backed-up image slots in a new edit, verifies the edit, commits with `ERROR_IF_IN_REVIEW`, and performs an independent read-back. Do not restore an old backup merely to bypass a current cleanup blocker.

## Policy forms

Data Safety, account deletion, app access, target audience, content rating, support identity, and other UI-only forms follow `docs/PLAY_POLICY_ANSWER_SET_2026.md`.

1. Capture a read-only Play Console snapshot.
2. Compare current answers with the exact answer set and shipped artifact.
3. Create a state-bound high-impact browser action plan.
4. Save only after separate approval for the exact current page state.
5. Stop without saving when the DOM/state digest changes.
6. Verify the public listing after Play review and propagation.

## Rollout governance

Metadata tools never change production rollout. The live production release is currently completed at `1.0`, while the approved store optimization design expects `0.1`. This mismatch blocks publication and cleanup until it is reconciled through a separate release/rollout decision. Never alter `store-config.json` merely to silence the guard.

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
