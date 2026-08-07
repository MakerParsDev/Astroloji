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
- Production repository gate `ENABLE_METADATA_PUBLISH` is enabled only for the exact workflow dispatch window and restored to `false` immediately after the mutation job starts.
- Service-account material stays in mode-`0600` temporary files and is never printed or committed.
- No Google Play purchase is performed.

## Repository Change

`Astroloji/play/store-config.json` changes `productionRolloutFraction` from `0.1` to `1.0`. This field is a fail-closed precondition for metadata operations, not a rollout command. Tests and operator documentation must state that a live rollout other than `1.0` blocks metadata publication/cleanup.

## Publication Flow

1. Merge the contract change through a MakerParsDev same-repository PR after local TDD, CI, and automated review.
2. From merged `main`, capture a fresh private Play backup and verify its SHA-256.
3. Run canonical metadata diff. Expected blockers must be zero; text/image changes are expected and extra locales remain preserved during publication.
4. Enable `ENABLE_METADATA_PUBLISH=true` only for the dispatch window and run the metadata workflow in `publish` mode with the exact backup run ID, SHA-256, and digest-derived confirmation.
5. Reset the repository gate to `false` immediately after the mutation job starts.
6. Require workflow success and independent live read-back for canonical TR/EN text/images, production rollout `1.0`, and the monthly/weekly subscription pairs.

## Unsupported-Locale Cleanup Flow

1. Capture a new fresh backup after metadata publication and successful read-back.
2. Run cleanup dry-run against that backup. The plan must freeze the current live-state digest, backup SHA-256, supported locales, removal count, subscriptions, package, and rollout `1.0`.
3. Expected removal count is determined from the fresh live state; the previously observed count was 84 but must not be assumed if live state changed.
4. Enable the metadata gate only for the exact cleanup workflow dispatch with all frozen values and exact cleanup confirmation.
5. Reset the gate to `false` immediately after the cleanup job starts.
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
- `ENABLE_METADATA_PUBLISH=false` after every mutation dispatch.
- Data Safety/account-deletion status is either independently verified/applied or explicitly recorded as unresolved UI-only work; no unsupported completion claim is made.
