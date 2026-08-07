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
- `ENABLE_METADATA_PUBLISH` returns to `false` after each mutation dispatch.
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

From merged main, use a temporary mode-`0600` Play service-account file sourced through Doppler. Capture a new backup outside the repository and record only backup path, SHA-256, locale count, rollout/status, and subscription pairs.

- [ ] **Step 2: Dry-run diff**

Run `scripts/diff-play-metadata.mjs` against the fresh backup. Expected: text/image changes, extra locales preserved, rollout `UNCHANGED 1`, subscriptions unchanged, zero blockers.

- [ ] **Step 3: Freeze exact publication confirmation**

Use the backup SHA-256 to derive `PUBLISH_TR_EN_METADATA_<sha-prefix>` exactly. Do not construct or reuse a confirmation from an older backup.

- [ ] **Step 4: Controlled workflow dispatch**

Publication gate reset: use a Bash trap/finally path; reset is unconditional. The reset path must cover dispatch failure, job-start failure, cancellation, confirmation timeout, and successful runs. Set `ENABLE_METADATA_PUBLISH=true` only inside that guarded block, dispatch `.github/workflows/android-metadata.yml` in `publish` mode with the exact backup run ID/SHA/confirmation, confirm the mutation job starts, then explicitly set the variable to `false`; the trap/finally path repeats the reset on every abnormal exit.

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

Cleanup gate reset: use a Bash trap/finally path; reset is unconditional. The same guarded block covers dispatch failure, job-start failure, cancellation, confirmation timeout, and successful runs. Set `ENABLE_METADATA_PUBLISH=true` only inside that block, dispatch the metadata workflow in `cleanup` mode with all frozen values, confirm the mutation job starts, then explicitly restore the gate to `false`; the trap/finally path repeats the reset on every abnormal exit.

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

Freshly verify `main`, Play production `1102 completed / 1.0`, exactly two supported locales, monthly/weekly subscriptions, metadata gate `false`, and no secret leakage. Preserve the original checkout's existing `Astroloji/gradlew` mode-only change.
