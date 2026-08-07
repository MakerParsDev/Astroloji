# Rewarded SSV Production Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the existing rewarded-access AdMob SSV controls are active in production, repair only evidence-backed gaps, and close GitHub issue #2 without exposing secrets or granting a real customer reward.

**Architecture:** Preserve the existing Android `prepare -> AdMob SSV -> claim` protocol, D1-backed challenge state machine, and transition Worker. Verification is evidence-first: local regressions and fresh read-only production checks happen before any mutation; one namespaced short-lived AdMob verification challenge proves a signed callback; only a concrete failed invariant can justify a small reviewed repair or guarded transition deployment.

**Tech Stack:** Kotlin/Android, Google Mobile Ads SSV, Cloudflare Workers + D1, TypeScript/Vitest, GitHub Actions, Doppler, Wrangler, GitHub CLI.

## Global Constraints

- Repository is exactly `MakerParsDev/Astroloji`; no fork is created.
- Git author/committer is `MakerParsDev <makerpars@gmail.com>`.
- Base branch is reviewed `main`; production deploys run only from merged `main`.
- `ENABLE_PRODUCTION_RELEASE` must remain `false` throughout this sub-project.
- No client callback or direct client request may grant rewarded access by itself.
- Do not expose callback signatures, full user IDs, challenge IDs, transaction IDs, credentials, tokens, or production secret values.
- Temporary verification state uses only the `admob-verify-*` user namespace and `admob-ssv-verification` identifier.
- Do not touch Play rollout, subscriptions, customer entitlements, or unrelated #6/#23/#22 scope.
- If a production deploy is required, use only the existing guarded transition workflow and keep rollback available before route mutation.

---
### Task 1: Re-prove the existing SSV acceptance contract locally

**Files:**
- Read: `backend/src/workers/reward.ts`
- Read: `backend/src/services/admobSsv.ts`
- Read: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/ads/RewardedAdManager.kt`
- Read: `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/repository/ContentRepository.kt`
- Test: existing backend, workflow, and Android reward suites only; no production mutation.

**Interfaces:**
- Consumes: current `prepare`, signed `/rewards/ssv`, challenge-based `/rewards/claim`, and Android claim-polling implementations.
- Produces: fresh local evidence that client-only reward completion remains fail-closed before any production check.

- [ ] **Step 1: Run the repository SSV/workflow contract tests**

```bash
cd /tmp/astro-reward-ssv-audit-20260807
node --test \
  scripts/check-backend-reward-ssv.test.mjs \
  scripts/check-ssv-transition-route.test.mjs \
  scripts/backend-admob-ssv-verification-challenge-workflow.test.mjs \
  scripts/backend-ssv-transition-workflows.test.mjs
```

Expected: all tests PASS; no workflow permits production release enablement or unguarded reward-route mutation.
- [ ] **Step 2: Run backend build, unit, and runtime verification**

```bash
cd /tmp/astro-reward-ssv-audit-20260807/backend
npm ci
npm run build
npm test
npm run test:runtime
npm run build:transition
npm run test:runtime:transition
```

Expected: TypeScript build, reward verifier/route tests, main Worker runtime tests, and transition Worker runtime tests all PASS.

- [ ] **Step 3: Run the Android rewarded-access regression tests**

```bash
cd /tmp/astro-reward-ssv-audit-20260807/Astroloji
export ANDROID_HOME=/home/msi/Android/Sdk
export ANDROID_SDK_ROOT=/home/msi/Android/Sdk
bash ./gradlew :app:testDebugUnitTest \
  --tests 'com.parsfilo.astrology.core.ads.RewardedAdSsvTest' \
  --tests 'com.parsfilo.astrology.core.data.repository.RewardClaimPollerTest' \
  --tests 'com.parsfilo.astrology.feature.daily.DailyViewModelTest' \
  --tests 'com.parsfilo.astrology.feature.weekly.WeeklyViewModelTest'
```

Expected: PASS, including the invariant that the local ad reward callback only initiates backend claim polling and does not unlock content directly.
- [ ] **Step 4: Stop on any local regression**

Do not create a production challenge or dispatch a deployment if any Step 1–3 command fails. Treat the failure as a concrete implementation gap and fix it with a separate RED/GREEN commit before resuming this plan.

---

### Task 2: Perform a fresh read-only production audit

**Files:**
- Read: `scripts/check-backend-reward-ssv.mjs`
- Read: `scripts/check-ssv-transition-route.mjs`
- Read: `backend/scripts/migrate-reward-ssv.sql`
- Read: `backend/wrangler.transition.toml`
- No repository mutation in the normal path.

**Interfaces:**
- Consumes: public backend URL, production GitHub environment variables, Doppler-held Cloudflare token, Wrangler read-only commands.
- Produces: sanitized booleans/counts proving gate state, live route behavior/ownership, exact transition secret names, and D1 reward schema.

- [ ] **Step 1: Freeze main and release-gate state**

```bash
REPO=MakerParsDev/Astroloji
MAIN_SHA="$(gh api repos/$REPO/commits/main --jq .sha)"
GATE="$(gh variable get ENABLE_PRODUCTION_RELEASE -R "$REPO")"
test "$GATE" = false
echo "main=$MAIN_SHA"
echo 'productionReleaseGate=false'
```

Expected: `ENABLE_PRODUCTION_RELEASE=false`; record only the SHA and boolean gate state.
- [ ] **Step 2: Verify live public route behavior without credentials**

```bash
cd /tmp/astro-reward-ssv-audit-20260807
BACKEND_BASE_URL=https://astrology.parsfilo.com \
  node scripts/check-backend-reward-ssv.mjs
BACKEND_BASE_URL=https://astrology.parsfilo.com \
LEGACY_SMOKE_JWT=invalid-transition-smoke-token \
  node scripts/check-ssv-transition-route.mjs
```

Expected: rewarded preflight returns `400 / MALFORMED_CALLBACK`; origin health is `200`; unsupported reward paths remain transition-local and fail closed; invalid legacy authentication returns `401`.

- [ ] **Step 3: Read Cloudflare route, secret-name, and D1 schema state without printing secret values**

```bash
cd /tmp/astro-reward-ssv-audit-20260807/backend
REPO=MakerParsDev/Astroloji
DOPPLER_PROJECT="$(gh variable get DOPPLER_PROJECT -R "$REPO")"
DOPPLER_CONFIG="$(gh variable get DOPPLER_CONFIG -R "$REPO")"
ZONE_ID="$(gh variable get CLOUDFLARE_ZONE_ID -R "$REPO")"
umask 077
CF_TOKEN="$(doppler secrets get CLOUDFLARE_API_TOKEN --plain --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG")"
trap 'rm -f /tmp/ssv-routes.json /tmp/ssv-secrets.json /tmp/ssv-schema.json; unset CF_TOKEN' EXIT INT TERM
```

Do not echo any variable values from the block above.
```bash
curl --fail --silent --show-error \
  -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes" \
  > /tmp/ssv-routes.json
CLOUDFLARE_API_TOKEN="$CF_TOKEN" \
  npx wrangler secret list --config wrangler.transition.toml --format json \
  > /tmp/ssv-secrets.json
CLOUDFLARE_API_TOKEN="$CF_TOKEN" \
  npx wrangler d1 execute astrology-db --remote --config wrangler.transition.toml \
  --command "SELECT name, sql FROM sqlite_master WHERE name = 'reward_challenges' OR name LIKE 'idx_reward_challenges_%' ORDER BY name;" \
  --json > /tmp/ssv-schema.json
```

- [ ] **Step 4: Validate the read-only Cloudflare evidence locally and emit only allowlisted facts**

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs';
const routes = JSON.parse(fs.readFileSync('/tmp/ssv-routes.json', 'utf8'));
const exact = (routes.result ?? []).filter((r) => r.pattern === 'astrology.parsfilo.com/api/v1/rewards/*');
if (exact.length !== 1 || exact[0].script !== 'astrology-ssv-transition') throw new Error('Exact SSV transition route invariant failed.');
const secrets = JSON.parse(fs.readFileSync('/tmp/ssv-secrets.json', 'utf8')).map((x) => x.name).sort();
const expectedSecrets = ['ADMOB_REWARDED_ID', 'JWT_SECRET'];
if (JSON.stringify(secrets) !== JSON.stringify(expectedSecrets)) throw new Error('Transition secret inventory invariant failed.');
const schemaText = fs.readFileSync('/tmp/ssv-schema.json', 'utf8');
for (const token of ['reward_challenges','transaction_id TEXT UNIQUE','idx_reward_challenges_user_entitlement','idx_reward_challenges_expires_at']) {
  if (!schemaText.includes(token)) throw new Error(`D1 reward schema invariant failed: ${token}`);
}
console.log(JSON.stringify({ exactRoute: true, worker: 'astrology-ssv-transition', secretNames: expectedSecrets, rewardSchema: true }));
NODE
```

Expected: all assertions pass; no route ID, zone ID, token, secret value, full challenge, or transaction value is printed.
- [ ] **Step 5: Repair infrastructure drift only when the read-only audit proves it**

If Step 2 or Step 4 proves the exact transition route, D1 schema, or exact two-secret inventory is missing/stale while Task 1 is green, dispatch only the existing guarded transition workflow from the frozen `main` SHA. Use a two-hour compatibility window; do not edit application code to compensate for infrastructure drift.

```bash
REPO=MakerParsDev/Astroloji
MAIN_SHA="$(gh api repos/$REPO/commits/main --jq .sha)"
DEADLINE="$(date -u -d '+2 hours' '+%Y-%m-%dT%H:%M:%SZ')"
gh workflow run backend-ssv-transition-deploy.yml -R "$REPO" --ref main \
  -f confirm=DEPLOY_TRANSITION \
  -f legacy_forward_until="$DEADLINE"
```

Select the newly created `workflow_dispatch` run, require `headSha == MAIN_SHA`, actor `MakerParsDev`, and conclusion `success`, then rerun Steps 2–4. If the deploy or post-deploy route check fails, immediately dispatch `backend-ssv-transition-rollback.yml` with `confirm=REMOVE_TRANSITION_ROUTE` and `delete_worker=false`, then require origin health `200` and SSV fall-through `403` before stopping.

If Task 1 fails, or the live audit reveals a code-contract defect rather than infrastructure drift, do **not** deploy; fix the defect through RED/GREEN tests and reviewed PR first.

---

### Task 3: Make verification-challenge cleanup self-verifying

**Files:**
- Modify: `backend/scripts/create-admob-verification-challenge.ts`
- Modify: `backend/tests/scripts/admobVerificationChallenge.test.ts`
- Modify: `.github/workflows/backend-admob-ssv-verification-challenge.yml`
- Test: `scripts/backend-admob-ssv-verification-challenge-workflow.test.mjs`

**Interfaces:**
- Consumes: existing namespaced `delete` command and D1 runner.
- Produces: delete evidence `{ operation: 'delete', deletedChallengePrefix: string, cleanupVerified: true }` only after a second D1 read proves both temporary rows are absent.
- [ ] **Step 1: Write the failing cleanup read-back tests**

In `backend/tests/scripts/admobVerificationChallenge.test.ts`, change the delete test so `runSql` returns a delete result followed by a zero-count read-back, and require two SQL calls plus `cleanupVerified: true`:

```ts
const runSql = vi.fn()
  .mockReturnValueOnce([{ success: true, meta: { changes: 1 } }])
  .mockReturnValueOnce([{ success: true, results: [{ challenge_count: 0, user_count: 0 }] }]);

expect(runSql).toHaveBeenCalledTimes(2);
expect(evidence).toEqual({
  operation: 'delete',
  deletedChallengePrefix: '22222222',
  cleanupVerified: true
});
```

Add a second test whose verification query returns `challenge_count: 1` or `user_count: 1`; require `executeVerificationChallengeCommand(...)` to throw `/cleanup verification failed/i` and never emit success evidence.

- [ ] **Step 2: Run RED**

```bash
cd /tmp/astro-reward-ssv-audit-20260807/backend
npm test -- tests/scripts/admobVerificationChallenge.test.ts
```

Expected: FAIL because delete currently performs one SQL call and has no `cleanupVerified` field.
- [ ] **Step 3: Implement minimal post-delete verification**

Add a cleanup result type and exact read-back query to `backend/scripts/create-admob-verification-challenge.ts`:

```ts
interface VerificationCleanupRow {
  challenge_count: number;
  user_count: number;
}

export function buildVerifyDeletionSql(challengeId: string, userId: string): string {
  const supplied = validateSuppliedVerificationValues(userId, challengeId);
  return `SELECT
  (SELECT COUNT(*) FROM reward_challenges WHERE id = ${sqlString(supplied.challengeId)}) AS challenge_count,
  (SELECT COUNT(*) FROM users WHERE id = ${sqlString(supplied.userId)}) AS user_count;`;
}
```

Generalize the local first-row helper to `firstRow<T>(...)`, run the verification query immediately after `buildDeleteVerificationChallengeSql(...)`, reject unless both counts are exactly zero, and return:

```ts
{
  operation: 'delete',
  deletedChallengePrefix: challengeId.slice(0, 8),
  cleanupVerified: true
}
```

Do not log the full challenge or user ID on either success or failure.
- [ ] **Step 4: Extend the workflow evidence allowlist and contract test**

In `.github/workflows/backend-admob-ssv-verification-challenge.yml`, change the delete allowlist to:

```js
delete: ['operation', 'deletedChallengePrefix', 'cleanupVerified'],
```

In `scripts/backend-admob-ssv-verification-challenge-workflow.test.mjs`, add an assertion that the workflow contains `cleanupVerified` in the delete evidence allowlist and still removes the temporary evidence file with `if: always()`.

- [ ] **Step 5: Run GREEN and the focused security gate**

```bash
cd /tmp/astro-reward-ssv-audit-20260807
cd backend && npm test -- tests/scripts/admobVerificationChallenge.test.ts && npm run build && cd ..
node --test scripts/backend-admob-ssv-verification-challenge-workflow.test.mjs
node scripts/scan-secrets.mjs
git diff --check
```

Expected: all PASS; secret scan reports no new secret material.

- [ ] **Step 6: Commit the cleanup hardening**

```bash
git config user.name MakerParsDev
git config user.email makerpars@gmail.com
git add backend/scripts/create-admob-verification-challenge.ts \
  backend/tests/scripts/admobVerificationChallenge.test.ts \
  .github/workflows/backend-admob-ssv-verification-challenge.yml \
  scripts/backend-admob-ssv-verification-challenge-workflow.test.mjs
git commit -m "fix(backend): verify rewarded SSV challenge cleanup"
```

---
### Task 4: Land cleanup hardening through an exact-head same-repository PR

**Files:**
- Uses only the Task 3 diff plus the already committed design/plan documents.
- No production mutation in this task.

**Interfaces:**
- Consumes: Task 1 green baseline, Task 2 read-only production audit, Task 3 cleanup fix.
- Produces: reviewed merged `main` code whose challenge-delete workflow performs its own D1 absence read-back.

- [ ] **Step 1: Run the pre-PR full backend/repository gate**

```bash
cd /tmp/astro-reward-ssv-audit-20260807
node --test scripts/*.test.mjs
cd backend
npm run build
npm test
npm run test:runtime
npm run build:transition
npm run test:runtime:transition
cd ..
node scripts/scan-secrets.mjs
actionlint .github/workflows/*.yml
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Reconfirm identity, remote, and base before push**

```bash
git fetch origin main
test "$(git remote get-url origin)" = 'https://github.com/MakerParsDev/Astroloji.git'
test "$(git config user.name)" = 'MakerParsDev'
test "$(git config user.email)" = 'makerpars@gmail.com'
git status --short --branch
git log --oneline origin/main..HEAD
```

Expected: only the intended spec/plan/cleanup commits are ahead of `origin/main` and the worktree is clean.
- [ ] **Step 3: Push the same-repository branch and open the repair PR**

```bash
BRANCH="$(git branch --show-current)"
git push -u origin "$BRANCH"
gh pr create -R MakerParsDev/Astroloji \
  --base main \
  --head "MakerParsDev:$BRANCH" \
  --title 'fix(backend): verify rewarded SSV cleanup' \
  --body 'Closes the cleanup-readback gap discovered while completing #2. No customer reward, Play rollout, subscription, or unrelated backend behavior is changed.'
```

Require `isCrossRepository=false`, PR author/head owner `MakerParsDev`, and PR head SHA equal local `HEAD`.

- [ ] **Step 4: Require fresh exact-head CI and review**

Wait for the repository's Android/backend/security checks and CodeRabbit review on the exact PR head SHA. Read every actionable review comment. For each valid finding, write a focused RED test, implement the smallest correction, rerun the local gate, push, and invalidate all previous CI/review results.

- [ ] **Step 5: Merge only the reviewed head**

```bash
HEAD_SHA="$(git rev-parse HEAD)"
PR_NUMBER="$(gh pr view -R MakerParsDev/Astroloji --json number --jq .number)"
gh pr merge "$PR_NUMBER" -R MakerParsDev/Astroloji --merge --match-head-commit "$HEAD_SHA"
```

If the installed `gh` does not support `--match-head-commit`, use the GitHub merge API with `sha=$HEAD_SHA`. Verify the merge commit's second parent is exactly `HEAD_SHA`, then freeze the new `main` SHA for Task 5.

---

### Task 5: Prove one signed production AdMob SSV callback end to end

**Files:**
- No repository source changes.
- Temporary local file: `/tmp/astro-admob-ssv-values.env` with mode `0600`; delete it at the end.
- Temporary repository Actions secrets: `ADMOB_SSV_TEST_USER_ID`, `ADMOB_SSV_TEST_CUSTOM_DATA`; delete them at the end.

**Interfaces:**
- Consumes: merged cleanup hardening, `backend-admob-ssv-verification-challenge.yml`, production AdMob SSV verification surface.
- Produces: run IDs and redacted evidence for `pending -> verified -> deleted`, plus a redacted Worker callback outcome.
- [ ] **Step 1: Freeze merged main and arm an ownership-aware cleanup session before creating secrets**

Run Task 5 Steps 1–7 in one persistent Bash session. Do not close that shell until Step 6 disarms the cleanup trap.

```bash
set -euo pipefail
REPO=MakerParsDev/Astroloji
WORKFLOW=backend-admob-ssv-verification-challenge.yml
MAIN_SHA="$(gh api repos/$REPO/commits/main --jq .sha)"
test "$(gh variable get ENABLE_PRODUCTION_RELEASE -R "$REPO")" = false
TEMP_FILE=/tmp/astro-admob-ssv-values.env

if gh secret list -R "$REPO" | awk '{print $1}' | \
  grep -Eq '^ADMOB_SSV_TEST_(USER_ID|CUSTOM_DATA)$'; then
  echo 'Temporary AdMob SSV repository secrets already exist; refusing to overwrite them.' >&2
  exit 1
fi

SSV_USER_SECRET_CREATED=0
SSV_CUSTOM_SECRET_CREATED=0
SSV_CHALLENGE_MAY_EXIST=0
SSV_CLEANUP_COMPLETE=0

dispatch_challenge_run() {
  local command="$1"
  local before_ids run_id new_ids
  before_ids=" $(gh run list -R "$REPO" -w "$WORKFLOW" -b main -c "$MAIN_SHA" \
    -e workflow_dispatch -u MakerParsDev -L 20 --json databaseId --jq 'map(.databaseId)|join(" ")') "
  gh workflow run "$WORKFLOW" -R "$REPO" --ref main \
    -f command="$command" -f confirm=MANAGE_ADMOB_SSV_CHALLENGE
  for _ in $(seq 1 30); do
    new_ids=()
    while IFS= read -r candidate; do
      [ -n "$candidate" ] || continue
      case "$before_ids" in
        *" $candidate "*) ;;
        *) new_ids+=("$candidate") ;;
      esac
    done < <(gh run list -R "$REPO" -w "$WORKFLOW" -b main -c "$MAIN_SHA" \
      -e workflow_dispatch -u MakerParsDev -L 20 --json databaseId --jq '.[].databaseId')
    if [ "${#new_ids[@]}" -eq 1 ]; then
      run_id="${new_ids[0]}"
      break
    fi
    if [ "${#new_ids[@]}" -gt 1 ]; then
      echo 'Ambiguous AdMob SSV workflow dispatch; refusing to select a run.' >&2
      return 1
    fi
    sleep 2
  done
  [ -n "${run_id:-}" ] || { echo 'AdMob SSV workflow run was not observed.' >&2; return 1; }
  gh run watch "$run_id" -R "$REPO" --exit-status >&2
  gh api "repos/$REPO/actions/runs/$run_id" --jq \
    "select(.head_sha == \"$MAIN_SHA\" and .head_branch == \"main\" and .event == \"workflow_dispatch\" and .actor.login == \"MakerParsDev\" and .conclusion == \"success\") | .id" \
    | grep -qx "$run_id"
  printf '%s\n' "$run_id"
}

cleanup_ssv_verification() {
  local original_status=$? cleanup_failed=0 delete_run=''
  trap - EXIT INT TERM
  set +e
  unset USER_ID CUSTOM_DATA
  if [ "$SSV_CLEANUP_COMPLETE" -ne 1 ] && [ "$SSV_CHALLENGE_MAY_EXIST" -eq 1 ]; then
    delete_run="$(dispatch_challenge_run delete)" || cleanup_failed=1
    if [ "$cleanup_failed" -eq 0 ]; then
      gh run view "$delete_run" -R "$REPO" --log | grep -F -- '- cleanupVerified: true' >/dev/null \
        || cleanup_failed=1
    fi
  fi
  if [ "$cleanup_failed" -eq 0 ]; then
    [ "$SSV_USER_SECRET_CREATED" -eq 0 ] || gh secret delete ADMOB_SSV_TEST_USER_ID -R "$REPO" || cleanup_failed=1
    [ "$SSV_CUSTOM_SECRET_CREATED" -eq 0 ] || gh secret delete ADMOB_SSV_TEST_CUSTOM_DATA -R "$REPO" || cleanup_failed=1
  else
    echo 'Challenge cleanup could not be proven; run-owned repository secrets are retained only for cleanup retry.' >&2
  fi
  rm -f "$TEMP_FILE"
  if [ "$cleanup_failed" -ne 0 ]; then exit 1; fi
  exit "$original_status"
}
trap cleanup_ssv_verification EXIT INT TERM

umask 077
USER_ID="admob-verify-$(node -e 'console.log(crypto.randomUUID())')"
CUSTOM_DATA="$(node -e 'console.log(crypto.randomUUID())')"
printf 'ADMOB_SSV_TEST_USER_ID=%s\nADMOB_SSV_TEST_CUSTOM_DATA=%s\n' "$USER_ID" "$CUSTOM_DATA" > "$TEMP_FILE"
chmod 600 "$TEMP_FILE"
printf '%s' "$USER_ID" | gh secret set ADMOB_SSV_TEST_USER_ID -R "$REPO"
SSV_USER_SECRET_CREATED=1
printf '%s' "$CUSTOM_DATA" | gh secret set ADMOB_SSV_TEST_CUSTOM_DATA -R "$REPO"
SSV_CUSTOM_SECRET_CREATED=1
unset USER_ID CUSTOM_DATA
```

Do not `cat` the file into CI logs, PR comments, issues, or chat. The authenticated AdMob UI operator may read it locally only for the provider verification form. If setup exits before a challenge dispatch, the trap removes only secrets created by this run and deletes the local file. If a challenge may have been created, the trap proves D1 cleanup first; if that proof fails it removes the local file but deliberately retains only the run-owned repository secrets so cleanup can be retried safely.

- [ ] **Step 2: Dispatch `create` and require exact merged-main execution**

```bash
SSV_CHALLENGE_MAY_EXIST=1
CREATE_RUN_ID="$(dispatch_challenge_run create)"
gh run view "$CREATE_RUN_ID" -R "$REPO" --log | grep -F -- '- status: pending' >/dev/null
```

The helper requires `event=workflow_dispatch`, `head_branch=main`, `head_sha=MAIN_SHA`, actor `MakerParsDev`, and conclusion `success`. The run log must expose only redacted evidence with status `pending` and no full temporary values.
- [ ] **Step 3: Trigger the provider-signed callback**

In the authenticated production rewarded-ad-unit AdMob SSV settings, use exactly:

```text
Callback URL: https://astrology.parsfilo.com/api/v1/rewards/ssv
User ID: value of ADMOB_SSV_TEST_USER_ID from /tmp/astro-admob-ssv-values.env
Custom data: value of ADMOB_SSV_TEST_CUSTOM_DATA from /tmp/astro-admob-ssv-values.env
```

Choose the provider's **Verify URL** action. Only after it succeeds choose **Use verified URL** and **Save**. If authenticated AdMob UI automation is unavailable in the active toolchain, this is the single human UI action; the temporary values stay local and must not be pasted into public artifacts.

Expected: AdMob reports successful URL verification. On failure, do not save; proceed directly to Step 6 cleanup and stop the verification as failed.

- [ ] **Step 4: Prove the challenge became verified and the expected Worker logged the callback**

Dispatch `inspect` on exact `MAIN_SHA` and require redacted evidence `status: verified` with a non-null transaction prefix. Then dispatch `callback` and require redacted evidence `status: found`, `scriptName: astrology-ssv-transition`, and `outcome: verified` (an exact provider retry may instead surface `duplicate_callback`, which is acceptable only when the preceding inspect already proved the same challenge is verified).

```bash
INSPECT_RUN_ID="$(dispatch_challenge_run inspect)"
gh run view "$INSPECT_RUN_ID" -R "$REPO" --log | grep -F -- '- status: verified' >/dev/null
CALLBACK_RUN_ID="$(dispatch_challenge_run callback)"
gh run view "$CALLBACK_RUN_ID" -R "$REPO" --log | \
  grep -Eq -- '- outcome: (verified|duplicate_callback)'
```

The helper enforces exact merged-main SHA, actor `MakerParsDev`, `workflow_dispatch`, and conclusion `success` before any summary is accepted.
- [ ] **Step 5: Re-prove replay/idempotency from automated tests, not destructive production replay**

```bash
cd /tmp/astro-reward-ssv-audit-20260807/backend
npm test -- tests/services/admobSsv.test.ts tests/workers/rewardSsv.test.ts tests/workers/rewards.test.ts
```

Expected: duplicate callback, transaction replay/reuse, expired/mismatched callback, pending claim, duplicate claim, and consumed-entitlement cases PASS. Do not manufacture a second production transaction or replay a captured signed URL.

- [ ] **Step 6: Delete the temporary production challenge and verify absence before deleting secrets**

```bash
DELETE_RUN_ID="$(dispatch_challenge_run delete)"
gh run view "$DELETE_RUN_ID" -R "$REPO" --log | grep -F -- '- cleanupVerified: true' >/dev/null
SSV_CHALLENGE_MAY_EXIST=0
gh secret delete ADMOB_SSV_TEST_USER_ID -R "$REPO"
SSV_USER_SECRET_CREATED=0
gh secret delete ADMOB_SSV_TEST_CUSTOM_DATA -R "$REPO"
SSV_CUSTOM_SECRET_CREATED=0
rm -f "$TEMP_FILE"
if gh secret list -R "$REPO" | grep -Eq 'ADMOB_SSV_TEST_(USER_ID|CUSTOM_DATA)'; then
  echo 'Temporary AdMob SSV repository secrets still exist.' >&2
  exit 1
fi
SSV_CLEANUP_COMPLETE=1
trap - EXIT INT TERM
```

Require exact merged-main execution, conclusion `success`, and redacted delete evidence `cleanupVerified: true` before removing either repository secret. Any earlier exit is handled by the already-armed trap; it never deletes a pre-existing secret because Step 1 refuses to overwrite those names.

- [ ] **Step 7: Recheck production route and release gate after cleanup**

```bash
cd /tmp/astro-reward-ssv-audit-20260807
BACKEND_BASE_URL=https://astrology.parsfilo.com node scripts/check-backend-reward-ssv.mjs
test "$(gh variable get ENABLE_PRODUCTION_RELEASE -R MakerParsDev/Astroloji)" = false
```

Expected: live SSV remains fail-closed for malformed callbacks and release gate remains false.

---
### Task 6: Record sanitized production evidence on a fresh main-based branch

**Files:**
- Create: `docs/verification/reward-ssv-production-verification-2026-08-07.md`
- No product/backend code changes in this task.

**Interfaces:**
- Consumes: Task 2 read-only audit facts, Task 4 merged cleanup PR, Task 5 exact run IDs and redacted outcomes.
- Produces: public evidence mapping every issue #2 acceptance criterion to tests or sanitized production proof.

- [ ] **Step 1: Create a fresh evidence branch from post-repair `origin/main`**

Use an isolated worktree named for `docs/reward-ssv-production-verification-20260807`. Do not continue committing on the already-merged repair branch.

- [ ] **Step 2: Write the verification document with only allowlisted facts**

The document must contain these exact sections:

```markdown
# Rewarded SSV Production Verification — 2026-08-07
## Reviewed code and release gates
## Local automated verification
## Read-only production audit
## Signed AdMob verification challenge
## Cleanup verification
## Issue #2 acceptance mapping
## Remaining scope
```

Populate each section only from captured Task 1–5 evidence: reviewed/merged commit SHA, GitHub workflow run IDs, boolean gate state, expected Worker name, route-ready boolean, exact secret **names only**, D1 schema-ready boolean, redacted `pending`/`verified`/callback/delete outcomes, and cleanup boolean. State explicitly that no real customer entitlement, Play rollout, subscription, or purchase was changed.
- [ ] **Step 3: Fail closed on sensitive evidence before commit**

```bash
DOC=docs/verification/reward-ssv-production-verification-2026-08-07.md
node scripts/scan-secrets.mjs
if grep -En 'signature=|Bearer[[:space:]]|ADMOB_SSV_TEST_(USER_ID|CUSTOM_DATA)=' "$DOC"; then
  echo 'Sensitive SSV material found in public evidence.' >&2
  exit 1
fi
node --input-type=module <<'NODE'
import fs from 'node:fs';
const text = fs.readFileSync('docs/verification/reward-ssv-production-verification-2026-08-07.md', 'utf8');
const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/ig;
if (uuid.test(text)) throw new Error('Full UUID-shaped identifiers are forbidden in public SSV evidence.');
NODE
git diff --check
```

Expected: all checks PASS; no full temporary or provider identifiers are present.

- [ ] **Step 4: Run the final verification gate represented by the evidence**

```bash
node --test scripts/*.test.mjs
cd backend && npm run build && npm test && npm run test:runtime && npm run build:transition && npm run test:runtime:transition && cd ..
cd Astroloji
export ANDROID_HOME=/home/msi/Android/Sdk
export ANDROID_SDK_ROOT=/home/msi/Android/Sdk
bash ./gradlew :app:testDebugUnitTest \
  --tests 'com.parsfilo.astrology.core.ads.RewardedAdSsvTest' \
  --tests 'com.parsfilo.astrology.core.data.repository.RewardClaimPollerTest' \
  --tests 'com.parsfilo.astrology.feature.daily.DailyViewModelTest' \
  --tests 'com.parsfilo.astrology.feature.weekly.WeeklyViewModelTest'
cd ..
```

Expected: all PASS on the exact evidence-PR head candidate.
- [ ] **Step 5: Commit only the sanitized evidence document**

```bash
git config user.name MakerParsDev
git config user.email makerpars@gmail.com
git add docs/verification/reward-ssv-production-verification-2026-08-07.md
git diff --cached --check
git commit -m "docs: record rewarded SSV production verification"
```

---

### Task 7: Merge evidence, re-read production, and close issue #2

**Files:**
- Repository change: Task 6 evidence document only.
- GitHub issue mutation after merge: close #2 and check #2 in milestone #1.

**Interfaces:**
- Consumes: exact evidence commit, fresh CI/review, merged main, live read-only endpoint checks.
- Produces: issue #2 closed as completed with sanitized evidence and milestone #1 updated.

- [ ] **Step 1: Push same-repository evidence PR and require exact-head review**

```bash
BRANCH="$(git branch --show-current)"
git push -u origin "$BRANCH"
gh pr create -R MakerParsDev/Astroloji \
  --base main \
  --head "MakerParsDev:$BRANCH" \
  --title 'docs: verify rewarded SSV production controls' \
  --body 'Records sanitized production verification for #2. No customer entitlement, Play rollout, subscription, or secret value is included.'
```

Require same-repository ownership, fresh CI/security checks, CodeRabbit review, and exact head SHA. Resolve valid review findings before merge and rerun all invalidated checks.
- [ ] **Step 2: Merge only the reviewed evidence head**

Freeze the exact PR head and merge with GitHub head matching. Verify the merge commit contains that exact head as parent and that `origin/main` advances to the expected merge commit.

- [ ] **Step 3: Perform fresh post-merge read-only verification**

```bash
REPO=MakerParsDev/Astroloji
MAIN_SHA="$(gh api repos/$REPO/commits/main --jq .sha)"
test "$(gh variable get ENABLE_PRODUCTION_RELEASE -R "$REPO")" = false
BACKEND_BASE_URL=https://astrology.parsfilo.com \
  node scripts/check-backend-reward-ssv.mjs
BACKEND_BASE_URL=https://astrology.parsfilo.com \
LEGACY_SMOKE_JWT=invalid-transition-smoke-token \
  node scripts/check-ssv-transition-route.mjs
if gh secret list -R "$REPO" | grep -Eq 'ADMOB_SSV_TEST_(USER_ID|CUSTOM_DATA)'; then
  echo 'Temporary SSV secrets remain after verification.' >&2
  exit 1
fi
echo "verifiedMain=$MAIN_SHA"
```

Expected: route checks PASS, gate is false, and both temporary verification secrets are absent.

- [ ] **Step 4: Close issue #2 with a sanitized completion comment**

Use a comment limited to: server-side AdMob SSV verified in production with a namespaced temporary challenge; client-only unlock remains fail-closed; duplicate/replay/idempotency tests pass; cleanup read-back passed; link the merged evidence PR/document. Do not include route IDs, secret values, full temporary IDs, signed URLs, transactions, or defensive thresholds.
```bash
gh issue close 2 -R MakerParsDev/Astroloji --reason completed --comment \
  'Production verification for the rewarded-access SSV contract is complete. A namespaced temporary verification challenge reached verified state through AdMob SSV, client-only unlock remains fail-closed, replay/idempotency coverage is green, and cleanup read-back confirmed temporary state removal. Sanitized evidence is committed at docs/verification/reward-ssv-production-verification-2026-08-07.md.'
```

- [ ] **Step 5: Mark #2 complete in milestone issue #1 without changing unrelated checklist items**

```bash
gh issue view 1 -R MakerParsDev/Astroloji --json body --jq .body > /tmp/astro-milestone-1.md
node --input-type=module <<'NODE'
import fs from 'node:fs';
const path = '/tmp/astro-milestone-1.md';
const body = fs.readFileSync(path, 'utf8');
const needle = '- [ ] #2';
if ((body.match(/- \[ \] #2/g) ?? []).length !== 1) throw new Error('Milestone #2 checkbox is missing or ambiguous.');
fs.writeFileSync(path, body.replace(needle, '- [x] #2'));
NODE
gh issue edit 1 -R MakerParsDev/Astroloji --body-file /tmp/astro-milestone-1.md
rm -f /tmp/astro-milestone-1.md
```

Re-read issues #1 and #2. Require #2 state `CLOSED`/completed and milestone #1 to contain exactly `- [x] #2`.

- [ ] **Step 6: Stop this plan at the #2 boundary**

Do not begin RTDN/webhook, monetization E2E, or Play Console policy mutations in this branch. Start issue #6 as a new brainstorming/spec/plan cycle from fresh `main` after #2 closure is independently verified.
