# Live Play Metadata Contract Design

**Date:** 2026-08-07
**Decision:** User selected approach A: keep production version `1102` fully rolled out and align the metadata safety contract with live production state before publishing store metadata.

## Goal

Publish the already-reviewed canonical Turkish and English Google Play listing metadata and assets without changing production rollout, then remove unsupported live locales through the existing state-bound cleanup flow.

## Invariants

- Package remains `com.parsfilo.astrology`.
- Production version `1102` remains `completed` at rollout fraction `1.0`.
- Metadata tooling must never mutate rollout or subscription catalog state.
- Canonical supported locales remain exactly `en-US` and `tr-TR`.
- Canonical subscriptions remain exactly `premium_monthly/monthly` and `premium_weekly/weekly`.
- Every Play mutation requires a fresh backup, exact digest-bound confirmation, fresh live-state verification immediately before mutation, edit-local verification before commit, and independent read-back after commit.
- Publication and unsupported-locale cleanup are separate Play edits and separate state-bound operations.
- `ENABLE_METADATA_PUBLISH` remains `false`. Mutation authority is a unique commit-status context `metadata-auth/$CORRELATION` on the exact merged `main` SHA. Status `authorized run=<id>;exp=<epoch>` is accepted only for the exact `github.run_id`, creator MakerParsDev, exact workflow run target URL, and at most 300 seconds; operator cleanup replaces it with `closed run=<id>`. The workflow verifies status with short-lived `${{ github.token }}` and needs no additional long-lived GitHub read-token secret.
- Service-account material stays in mode-`0600` temporary files on Unix. On Windows, the empty temporary file must have inherited NTFS ACLs disabled, an owner-only/current-user `Allow` rule applied with `Set-Acl`, and ACL verification proving no non-owner `Allow` rule before any secret write/read. Material is never printed or committed.
- No Google Play purchase is performed.

## Repository Change

`Astroloji/play/store-config.json` changes `productionRolloutFraction` from `0.1` to `1.0`. This field is a fail-closed precondition for metadata operations, not a rollout command. Tests and operator documentation must state that a live rollout other than `1.0` blocks metadata publication/cleanup.

## Publication Flow

1. Merge the contract change through a MakerParsDev same-repository PR after local TDD, CI, and automated review.
2. From merged `main`, capture a fresh private Play backup and verify its SHA-256.
3. Run canonical metadata diff. Expected blockers must be zero; text/image changes are expected and extra locales remain preserved during publication.
4. Generate a unique immutable `authorization_correlation`, freeze the merged `main` head SHA, dispatch `publish` with the backup inputs plus correlation, then select **exactly one** canonical `workflow_dispatch` run matching exact run ID, head SHA, event, actor, publish mode, and correlation encoded by `run-name`; reject ambiguous or mismatched runs before authorization.
5. Post state `success` to `metadata-auth/$CORRELATION` on that exact SHA with description `authorized run=<id>;exp=<epoch>` and exact run target URL, with expiry at most 300 seconds. Bash closure replaces it with `closed run=<id>` and keeps `ENABLE_METADATA_PUBLISH=false`; Windows PowerShell posts the same closed status in `finally`. Wait for authorization success and mutation start, then close authorization immediately.
6. Require workflow success and independent live read-back for canonical TR/EN text/images, production rollout `1.0`, and the monthly/weekly subscription pairs.

## Unsupported-Locale Cleanup Flow

1. Capture a new fresh backup after metadata publication and successful read-back.
2. Run cleanup dry-run against that backup. The plan must freeze the current live-state digest, backup SHA-256, supported locales, removal count, subscriptions, package, and rollout `1.0`.
3. Expected removal count is determined from the fresh live state; the previously observed count was 84 but must not be assumed if live state changed.
4. Generate a new immutable `authorization_correlation`, freeze the current merged `main` head SHA, dispatch cleanup with all frozen values plus correlation, and require **exactly one** canonical `workflow_dispatch` run matching exact run ID, head SHA, event, actor, cleanup mode, and correlation before authorization.
5. Post `authorized run=<id>;exp=<epoch>` to `metadata-auth/$CORRELATION` for at most 300 seconds, then replace it with `closed run=<id>` after cleanup starts. Bash and PowerShell cleanup both keep `ENABLE_METADATA_PUBLISH=false`, and the final workflow independently verifies the latest exact context is closed.
6. Require workflow success and independent read-back proving exactly `en-US` and `tr-TR` remain and rollout/subscriptions are unchanged.

## Policy Forms

Data Safety and account-deletion Console fields remain a separate high-impact UI-only operation. Repository metadata publication and locale cleanup do not imply those fields were changed. They require a fresh live Console read, exact field-state verification, explicit state-bound save, and public propagation verification using available tooling. If the connected tools cannot safely read/write those UI-only fields, record them as a remaining manual Console action rather than claiming completion.

## Rollback

Keep the pre-publication backup and the fresh pre-cleanup backup outside the repository with mode `0600`. If a committed metadata publication must be reverted, use the guarded restore flow with the exact backup-derived confirmation and independent read-back. Locale cleanup restore uses the pre-cleanup backup and the same guarded restore mechanism. Rollout is not changed as part of rollback.

## Success Criteria

- Contract PR merged to `MakerParsDev/Astroloji:main` with all required checks green.
- Fresh post-merge diff has no rollout or subscription blocker.
- Canonical TR/EN listing metadata and assets are committed and independently verified live.
- Unsupported locale cleanup is committed from a fresh state-bound plan and exactly the canonical two locales remain.
- Production version `1102` remains completed at `1.0` throughout.
- Monthly/weekly subscriptions remain unchanged.
- `ENABLE_METADATA_PUBLISH=false` and the latest operation-specific `metadata-auth/$CORRELATION` status is `closed run=<exact-run-id>` after every mutation flow.
- Data Safety/account-deletion status is either independently verified/applied or explicitly recorded as unresolved UI-only work; no unsupported completion claim is made.
