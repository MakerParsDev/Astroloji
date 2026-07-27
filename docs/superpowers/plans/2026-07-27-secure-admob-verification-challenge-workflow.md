# Secure AdMob Verification Challenge Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline value generator and a main-only production workflow that creates, inspects, and deletes AdMob SSV verification challenges without exposing full User ID or Custom data values in logs or summaries.

**Architecture:** A standalone local HTML page generates the two full values with browser Web Crypto and keeps them only in memory. A hardened TypeScript CLI consumes the two temporary Actions secrets, validates them, performs namespace-restricted D1 SQL, and emits only redacted evidence. One `workflow_dispatch` workflow gates `create`, `inspect`, and `delete`; the delete path removes only the exact D1 row and emits a reminder for the operator to delete the two temporary repository secrets manually.

**Tech Stack:** Static HTML/JavaScript, Node.js 24, TypeScript 5.9, Vitest 3.2, GitHub Actions, Doppler CLI, Wrangler 4.112, Cloudflare D1.

## Global Constraints

- The full User ID and challenge UUID must never be written to workflow logs, `$GITHUB_STEP_SUMMARY`, artifacts, caches, issues, pull requests, or `$GITHUB_ENV`.
- The offline generator must perform no network requests and use no external scripts, analytics, service workers, cookies, localStorage, sessionStorage, IndexedDB, or automatic clipboard writes.
- `ADMOB_SSV_TEST_USER_ID` must match `admob-verify-<uuid>` and `ADMOB_SSV_TEST_CUSTOM_DATA` must be an exact UUID.
- Challenges expire exactly 15 minutes after workflow creation time.
- D1 reads/deletes must require both the exact challenge UUID and `user_id LIKE 'admob-verify-%'`.
- The workflow runs only from `main`, uses the `production` environment, and keeps `ENABLE_PRODUCTION_RELEASE=false` unchanged.
- The workflow has top-level `contents: read` and never receives repository Actions-secrets write permission.
- No full backend deploy, transition route mutation, Android release, or Play production rollout is part of this plan.

---

### Task 1: Harden the D1 Challenge CLI for Supplied Secret Values

**Files:**
- Modify: `backend/scripts/create-admob-verification-challenge.ts`
- Create: `backend/tests/scripts/admobVerificationChallenge.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: `ADMOB_SSV_TEST_USER_ID` and `ADMOB_SSV_TEST_CUSTOM_DATA` environment variables.
- Produces:
  - `validateSuppliedVerificationValues(userId: string, challengeId: string)`
  - `createSuppliedVerificationChallengeValues(options)`
  - import-safe CLI commands `create`, `inspect`, and `delete` that print only redacted JSON.

- [ ] **Step 1: Write failing validation and output-redaction tests**

Add deterministic tests for valid supplied values, malformed namespace, malformed UUID, exact 15-minute expiry, namespace-restricted SQL, and redacted create/inspect/delete evidence. Assert serialized evidence never contains either full supplied value.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
npm test -- --run tests/scripts/admobVerificationChallenge.test.ts
```

Expected: FAIL because the supplied-value functions and redacted CLI contract do not exist.

- [ ] **Step 3: Implement minimal supplied-value validation**

Use strict UUID validation and require `admob-verify-<uuid>`. Create values from the supplied identifiers and `now + 15 minutes`. Change CLI commands to read environment variables, reject positional full values, and never print full identifiers.

- [ ] **Step 4: Make remote SQL execution injectable and import-safe**

Keep production execution on `execFileSync('npx', ['wrangler', ...])`; expose a command-runner interface for tests. Do not construct shell strings.

- [ ] **Step 5: Run focused and existing transition tests**

```powershell
npm test -- --run tests/scripts/admobVerificationChallenge.test.ts tests/scripts/transitionShared.test.ts
npm run build
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```powershell
git add backend/scripts/create-admob-verification-challenge.ts backend/tests/scripts/admobVerificationChallenge.test.ts backend/package.json
git commit -m "fix(admob): consume verification values without logging"
```

---

### Task 2: Add the Network-Free Offline Generator

**Files:**
- Create: `tools/admob-ssv-verification-values.html`
- Create: `scripts/admob-ssv-offline-generator.test.mjs`

**Interfaces:**
- Consumes: browser `crypto.randomUUID()` and explicit button clicks.
- Produces: in-memory User ID, Custom data, generated-at time, and 15-minute expiry; copy happens only after explicit clicks.

- [ ] **Step 1: Write the failing generator contract test**

Assert the HTML uses `crypto.randomUUID()`, contains the `admob-verify-` namespace and 15-minute warning, has no HTTP URLs/network APIs/persistent storage/service worker, and contains exactly two explicit clipboard writes. Extract and execute a pure `generateValues(randomUUID, now)` function with deterministic UUIDs.

- [ ] **Step 2: Run the test and verify RED**

```powershell
node --test scripts/admob-ssv-offline-generator.test.mjs
```

Expected: FAIL because the HTML file does not exist.

- [ ] **Step 3: Implement one self-contained offline HTML file**

Include a restrictive CSP with `connect-src 'none'`, no external resources, a “Yeni değerler üret” button, two explicit copy buttons, and a warning to keep the page open because GitHub cannot reveal saved secret values.

- [ ] **Step 4: Run the generator test**

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add tools/admob-ssv-verification-values.html scripts/admob-ssv-offline-generator.test.mjs
git commit -m "feat(admob): add offline SSV verification value generator"
```

---

### Task 3: Add the Main-Only Challenge Management Workflow

**Files:**
- Create: `.github/workflows/backend-admob-ssv-verification-challenge.yml`
- Create: `scripts/backend-admob-ssv-verification-challenge-workflow.test.mjs`
- Modify: `.github/workflows/ci.yml` only if root tests are explicitly enumerated.

**Interfaces:**
- Consumes:
  - `command`: `create | inspect | delete`
  - `confirm`: exact `MANAGE_ADMOB_SSV_CHALLENGE`
  - repository secrets `ADMOB_SSV_TEST_USER_ID`, `ADMOB_SSV_TEST_CUSTOM_DATA`
  - existing Doppler settings and `DOPPLER_TOKEN`
- Produces: redacted summary evidence; delete also emits the exact two temporary secret names that the operator must remove manually.

- [ ] **Step 1: Write the failing workflow contract test**

Assert allowed commands, confirmation phrase, `main` gate, production environment, minimal permissions, exact secret names, explicit `::add-mask::`, all three package commands, absence of GitHub secret-write tokens and `gh secret delete`, no echo of secret variables, and safe operation ordering.

- [ ] **Step 2: Run the workflow test and verify RED**

```powershell
node --test scripts/backend-admob-ssv-verification-challenge-workflow.test.mjs
```

Expected: FAIL because the workflow does not exist.

- [ ] **Step 3: Implement gates and minimal permissions**

Use top-level `contents: read`, non-cancelling concurrency, repository/main/confirmation/command job checks, and `environment: production`. Expose challenge secrets only to masking/validation and the matching CLI step.

- [ ] **Step 4: Implement create/inspect/delete execution**

Install dependencies and Doppler CLI, load/mask `CLOUDFLARE_API_TOKEN`, run exactly one backend package command, capture redacted JSON in `$RUNNER_TEMP`, and allowlist summary keys. After D1 deletion succeeds, publish a manual-cleanup reminder naming only `ADMOB_SSV_TEST_USER_ID` and `ADMOB_SSV_TEST_CUSTOM_DATA`. Never request repository-secrets write permission or write any sensitive value to `$GITHUB_ENV`.

- [ ] **Step 5: Run workflow tests, YAML parse, and secret scan**

```powershell
node --test scripts/backend-admob-ssv-verification-challenge-workflow.test.mjs scripts/admob-ssv-offline-generator.test.mjs
node scripts/scan-secrets.mjs
```

Parse the new workflow and CI YAML with PyYAML. Expected: all PASS.

- [ ] **Step 6: Commit**

```powershell
git add .github/workflows/backend-admob-ssv-verification-challenge.yml .github/workflows/ci.yml scripts/backend-admob-ssv-verification-challenge-workflow.test.mjs
git commit -m "feat(ci): manage AdMob SSV verification challenges"
```

---

### Task 4: Update Operator Documentation and Complete Verification

**Files:**
- Modify: `backend/README.md`
- Modify: `docs/PLAY_PRODUCTION_READINESS.md`
- Modify: `RELEASE_RUNBOOK.md`
- Modify: `docs/superpowers/specs/2026-07-27-secure-admob-verification-challenge-workflow-design.md`
- Modify: `scripts/backend-admob-ssv-verification-challenge-workflow.test.mjs`

**Interfaces:**
- Consumes: generator path, secret names, workflow commands, confirmation phrase, manual secret-cleanup requirement.
- Produces: one consistent operator sequence with no instruction to print or pass full values on a command line.

- [ ] **Step 1: Write failing documentation assertions**

Require all runbooks to mention:
`tools/admob-ssv-verification-values.html`,
`ADMOB_SSV_TEST_USER_ID`,
`ADMOB_SSV_TEST_CUSTOM_DATA`,
`MANAGE_ADMOB_SSV_CHALLENGE`,
and the sequence `create → AdMob test → inspect verified → delete`.
Reject obsolete printed-output and positional `<challenge-uuid>` instructions.

- [ ] **Step 2: Run docs test and verify RED**

Expected: FAIL because current runbooks still describe printed values and positional UUID arguments.

- [ ] **Step 3: Rewrite operator flow**

Document: open generator locally; keep it open; save both values as temporary Actions secrets; dispatch create; verify in AdMob using still-visible local values; dispatch inspect and require verified plus transaction prefix; dispatch delete, confirm D1 cleanup, then remove both temporary secret names manually in repository Actions settings.

- [ ] **Step 4: Run full final verification**

```powershell
node --test scripts/*.test.mjs
Push-Location backend
npm run build
npm test -- --run
npm run test:runtime
npm run test:runtime:transition
Pop-Location
node scripts/scan-secrets.mjs
```

Parse all workflow YAML and run `git diff --check`. Expected: all PASS.

- [ ] **Step 5: Commit docs**

```powershell
git add backend/README.md docs/PLAY_PRODUCTION_READINESS.md RELEASE_RUNBOOK.md docs/superpowers/specs/2026-07-27-secure-admob-verification-challenge-workflow-design.md scripts/backend-admob-ssv-verification-challenge-workflow.test.mjs
git commit -m "docs(admob): document secure SSV verification flow"
```

- [ ] **Step 6: Push and PR**

Push the feature branch, open a PR against `main`, and require current-SHA CI, secret scanning, Semgrep/GitGuardian, and review findings to be green before merge. Do not dispatch the new production workflow before merge and successful `main` CI.
