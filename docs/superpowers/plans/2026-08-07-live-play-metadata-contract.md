# Live Play Metadata Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the fail-closed Play metadata contract with the already-completed `1.0` production rollout, publish canonical Turkish/English metadata, then remove unsupported locales without changing rollout or subscriptions.

**Architecture:** Treat `productionRolloutFraction` as a read-only live-state precondition. Land the contract update through normal GitHub review first. All Google Play writes then use the existing backup/digest/confirmation workflow, with publication and locale cleanup performed as separate edits and independent read-backs.

**Tech Stack:** Node.js 22/24, Android Publisher API tooling in `scripts/`, GitHub Actions, Doppler, Git/GitHub CLI.

## Global Constraints

- Package: `com.parsfilo.astrology`.
- Production version `1102` remains `completed` at rollout fraction `1.0`.
- Supported locales remain exactly `en-US` and `tr-TR`.
- Subscriptions remain `premium_monthly/monthly` and `premium_weekly/weekly`.
- Metadata tooling never mutates rollout or subscription state.
- Every Play mutation uses a fresh backup, exact digest-bound confirmation, fresh-state guard, edit-local verification, and independent post-commit read-back.
- `ENABLE_METADATA_PUBLISH` remains `false`; mutation authority is a unique commit-status context `metadata-auth/$CORRELATION` on the exact merged `main` SHA. Status description `authorized run=<id>;exp=<epoch>` is accepted only for the exact workflow run and at most 300 seconds, then the same context is replaced by `closed run=<id>`. The workflow reads status with its short-lived `${{ github.token }}` and needs no additional long-lived GitHub read-token secret.
- No secret/token/private key or full account identity is printed or committed.

---

### Task 1: Encode the live rollout contract

**Files:**
- Modify: `scripts/play-store-config.test.mjs`
- Modify: `scripts/play-diff.test.mjs`
- Modify: `Astroloji/play/store-config.json`
- Modify: `docs/PLAY_STORE_OPTIMIZATION_RUNBOOK.md`
- Modify: `docs/verification/global-play-store-optimization-2026-08-07.md`

**Interfaces:**
- Consumes: `loadStoreConfig(repositoryRoot)` and `buildPlayDiff(live, proposed)`.
- Produces: canonical `productionRolloutFraction: 1.0`; live `1.0` passes, drift from `1.0` blocks.

- [ ] **Step 1: Write failing tests**

Add assertions that the real store config owns rollout `1.0`, that a live `1.0` diff is `UNCHANGED`, and that a live `0.1` rollout produces a blocking drift against expected `1`.

- [ ] **Step 2: Verify RED**

Execution host: MSI Ubuntu or GitHub Ubuntu (Bash); shell wildcard/glob behavior in this plan assumes Bash-compatible execution.

Run:

```bash
node --test scripts/play-store-config.test.mjs scripts/play-diff.test.mjs
```

Expected: failures showing the current canonical value is `0.1` and diff expectations still target `0.1`.

- [ ] **Step 3: Minimal implementation**

Change only `Astroloji/play/store-config.json` to `"productionRolloutFraction": 1.0`, update the affected fixture expectations, and update runbook/verification language to record the explicit A decision. Do not add any code that updates a Play track.

- [ ] **Step 4: Verify GREEN and full local gate**

Execution host: MSI Ubuntu or GitHub Ubuntu (Bash); `scripts/*.test.mjs` and `.github/workflows/*.yml` rely on shell glob expansion.

Run:

```bash
node --test scripts/*.test.mjs
node scripts/validate-play-metadata.mjs
node scripts/scan-secrets.mjs
actionlint .github/workflows/*.yml
git diff --check
```

Expected: all green, no secret findings, no workflow lint errors.

- [ ] **Step 5: Commit and push**

Commit as MakerParsDev, push detached HEAD to `MakerParsDev/Astroloji:fix/play-metadata-live-contract-20260807`, open a same-repository PR to `main`, and verify author/head owner/repo identity from GitHub API.

### Task 2: Review and merge the contract PR

**Files:** none unless review findings require changes.

**Interfaces:**
- Consumes: exact PR head SHA.
- Produces: merged `main` SHA containing the `1.0` metadata contract.

- [ ] **Step 1: Wait for fresh checks on the exact head SHA**

Require Android, backend, secret-scan, Semgrep, GitGuardian, and CodeRabbit success.

- [ ] **Step 2: Resolve actionable review findings with TDD**

For every new finding, reproduce with a failing test when applicable, apply the minimum fix, rerun the local full gate, push, and wait for a fresh review cycle.

- [ ] **Step 3: Merge with exact-head guard**

Merge only when the PR is same-repository, author/head owner are MakerParsDev, `MERGEABLE/CLEAN`, all current checks are green, and CodeRabbit reports review completed successfully.

### Task 3: Publish canonical TR/EN metadata

**Files:** no repository source mutation during Play operation.

**Interfaces:**
- Consumes: merged main SHA and a fresh private backup artifact.
- Produces: live canonical TR/EN text/images with extra locales preserved.

- [ ] **Step 1: Fresh backup/read-back**

From merged main, create a temporary mode-`0600` Play service-account file outside the repository and source it through Doppler without printing the secret. On MSI Ubuntu, preserve mode `0600` and register `trap 'rm -f "$PLAY_SERVICE_ACCOUNT_JSON_PATH"' EXIT INT TERM` immediately after file creation. On Windows PowerShell, create the empty file before any secret write/read, disable inherited NTFS ACLs with `$acl.SetAccessRuleProtection($true, $false)`, grant `Allow` only to the current user, apply it with `Set-Acl`, then verify the resulting ACL has no non-owner `Allow` entries. Only after that owner-only NTFS ACL verification may the secret be written or read. Wrap use in `try/finally` and call `Remove-Item -Force $env:PLAY_SERVICE_ACCOUNT_JSON_PATH -ErrorAction SilentlyContinue` in `finally`. Credential cleanup covers success, failure, timeout, cancellation, and every handled exit. Capture a new backup outside the repository and record only backup path, SHA-256, locale count, rollout/status, and subscription pairs.

- [ ] **Step 2: Dry-run diff**

Run `scripts/diff-play-metadata.mjs` against the fresh backup. Expected: text/image changes, extra locales preserved, rollout `UNCHANGED 1`, subscriptions unchanged, zero blockers.

- [ ] **Step 3: Freeze exact publication confirmation**

Use the backup SHA-256 to derive `PUBLISH_TR_EN_METADATA_<sha-prefix>` exactly. Do not construct or reuse a confirmation from an older backup.

- [ ] **Step 4: Controlled workflow dispatch**

Keep `ENABLE_METADATA_PUBLISH=false`. Generate a unique UUID `authorization_correlation`, freeze the exact merged `main` head SHA, and dispatch `.github/workflows/android-metadata.yml` in `publish` mode with the exact backup run ID/SHA/confirmation plus that immutable correlation. Poll only the canonical repository's `android-metadata.yml` `workflow_dispatch` runs on `main` and require **exactly one** run whose run ID is unique, head SHA equals the frozen SHA, event is `workflow_dispatch`, actor is MakerParsDev, and `display_title` encodes the expected publish mode plus the exact correlation; reject zero after bounded polling, multiple, mismatched, or ambiguous runs. Define status context `metadata-auth/$CORRELATION`, exact run target URL, and install unconditional Bash cleanup before authorization so every handled exit posts `closed run=$RUN_ID` to that same context and restores `ENABLE_METADATA_PUBLISH=false`. Post state `success` with description `authorized run=$RUN_ID;exp=<epoch>` on the exact merged SHA/context/target URL, with expiry no more than 300 seconds (5 minutes). Wait for `authorize-mutation` success and `play-mutation` start, then immediately post `closed run=$RUN_ID`; keep the trap until closure succeeds. Dispatch failure, job-start failure, cancellation, confirmation timeout, and every handled exit retain cleanup. On Windows PowerShell, post authorization inside `try` and post `closed run=$RunId` plus `ENABLE_METADATA_PUBLISH=false` in `finally`. The workflow uses `${{ github.token }}` with `statuses: read` to verify authorization and independently requires the latest exact status to be closed; no additional long-lived GitHub read-token secret is used.

- [ ] **Step 5: Verify publication**

Require workflow success. Independently read back Play state and verify canonical TR/EN text/images, rollout `1.0`, monthly/weekly subscriptions, and no unintended locale deletion.

### Task 4: Remove unsupported locales

**Files:** no repository source mutation during Play operation.

**Interfaces:**
- Consumes: a new fresh post-publication backup and cleanup dry-run plan.
- Produces: exactly `en-US` and `tr-TR` live listings.

- [ ] **Step 1: Capture a new post-publication backup**

Never reuse the pre-publication backup. Record its SHA-256 and mode only in redacted evidence.

- [ ] **Step 2: Generate cleanup dry-run**

Run `scripts/cleanup-play-locales.mjs --backup <fresh-backup>`. Freeze the returned live-state digest, removal count, backup SHA-256, and exact `REMOVE_<count>_UNSUPPORTED_PLAY_LOCALES_<state-prefix>` confirmation.

- [ ] **Step 3: Controlled cleanup workflow dispatch**

Keep `ENABLE_METADATA_PUBLISH=false`. Generate a new unique UUID `authorization_correlation` for cleanup, freeze the current merged `main` head SHA, and dispatch `cleanup` with all frozen cleanup values plus that correlation. Poll canonical `workflow_dispatch` runs and require **exactly one** run matching the exact run ID, frozen head SHA, event `workflow_dispatch`, actor MakerParsDev, cleanup mode, and immutable correlation encoded in `display_title`; reject zero after bounded polling, ambiguous, or mismatched runs. Define `metadata-auth/$CORRELATION` on that exact SHA and install the same unconditional Bash status closure before authorization. Post state `success` with description `authorized run=$RUN_ID;exp=<epoch>` and exact target URL for no more than 300 seconds (5 minutes). After `authorize-mutation` success and `play-mutation` start, replace it with state `success` and description `closed run=$RUN_ID`, while keeping `ENABLE_METADATA_PUBLISH=false`. Dispatch failure, job-start failure, cancellation, confirmation timeout, and success retain cleanup. On Windows PowerShell, post authorization inside `try` and the closed status plus legacy false gate in `finally`. The workflow final independent read-back fails unless the latest exact context is closed and was created by MakerParsDev; no additional long-lived GitHub read-token secret is used.

- [ ] **Step 4: Verify cleanup**

Require workflow success and independent read-back proving exactly two locales remain, rollout remains `1.0`, subscriptions remain monthly/weekly, and the repository gate is `false`.

### Task 5: Policy-form verification and final evidence

**Files:** update verification evidence only if a follow-up repository commit is necessary.

**Interfaces:**
- Consumes: available connected Play Console/browser capabilities.
- Produces: verified policy state or an explicit unresolved manual action.

- [ ] **Step 1: Discover supported policy-form tooling**

Determine whether connected tools can safely read and state-bind Data Safety/account-deletion fields. Do not infer UI state from repository docs.

- [ ] **Step 2: Apply only when live state is readable and exact**

If safe read/write tooling exists, compare the current Console fields with `docs/PLAY_POLICY_ANSWER_SET_2026.md`, apply only the exact approved corrections, and verify read-back/public propagation. If tooling does not support this safely, stop and record the exact manual Console actions still required.

- [ ] **Step 3: Final verification**

Freshly verify `main`, Play production `1102 completed / 1.0`, exactly two supported locales, monthly/weekly subscriptions, `ENABLE_METADATA_PUBLISH=false`, the latest operation-specific `metadata-auth/$CORRELATION` status is `closed run=<exact-run-id>`, and no secret leakage. Preserve the original checkout's existing `Astroloji/gradlew` mode-only change.
