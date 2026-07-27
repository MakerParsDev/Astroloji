# Secure AdMob Verification Challenge Workflow Design

## Context

The rewarded SSV transition Worker is live at `https://astrology.parsfilo.com/api/v1/rewards/ssv` and correctly rejects malformed callbacks with `400 / MALFORMED_CALLBACK`. AdMob URL verification still requires a short-lived D1 challenge containing a full `user_id` and challenge UUID (`custom_data`). Existing operations machines do not have a usable local Doppler session, and printing the values in GitHub Actions logs would expose them to repository readers.

## Goal

Provide a main-only, auditable GitHub Actions workflow that can create, inspect, and delete a short-lived AdMob verification challenge without placing the full User ID or Custom data value in workflow logs, job summaries, artifacts, issues, or pull requests.

## Selected Approach

Use a local, offline HTML generator plus the main-only `backend-admob-ssv-verification-challenge` workflow with three commands: `create`, `inspect`, and `delete`; every dispatch requires confirmation `MANAGE_ADMOB_SSV_CHALLENGE`.

The offline generator:

1. Runs entirely in the operator's browser without network requests, external scripts, analytics, storage, or service workers.
2. Generates a UUID challenge ID and an `admob-verify-<uuid>` User ID with `crypto.randomUUID()`.
3. Shows copy buttons for the two full values and a clear 15-minute validity warning.
4. Never writes values to local storage, IndexedDB, cookies, clipboard automatically, files, or browser history.

Before `create`, the operator manually saves the two values as temporary repository Actions secrets named `ADMOB_SSV_TEST_USER_ID` and `ADMOB_SSV_TEST_CUSTOM_DATA`. GitHub does not reveal secret values after saving, so the operator must keep the offline generator page open until the AdMob verification is complete.

For `create`:

1. Validate that the workflow runs from `main` in the `production` environment.
2. Read the two temporary repository secrets and mask both values before any command uses them.
3. Validate the User ID namespace and UUID format before database access.
4. Load the Cloudflare API token through Doppler and mask it immediately.
5. Insert or reuse only the exact namespaced temporary D1 user required by the foreign key, then insert the pending challenge using the supplied values and the existing transition Wrangler configuration.
6. Store only redacted prefixes and expiration time in the job summary.

For `inspect`:

1. Accept the challenge UUID through the encrypted `ADMOB_SSV_TEST_CUSTOM_DATA` secret, not as a workflow input.
2. Query D1 and publish only redacted evidence: challenge prefix, status, transaction prefix, and expiration.
3. Fail if the row is absent or does not belong to the `admob-verify-` namespace.

For `delete`:

1. Delete only the exact challenge UUID for the supplied `admob-verify-*` User ID, then delete that exact temporary D1 user only when no reward challenge still references it.
2. Publish only the deleted challenge prefix and an explicit reminder to remove the two temporary repository secrets manually.
3. Do not request or use any GitHub token with repository-secrets write permission.

## Security Boundaries

- The workflow has `contents: read`; it does not create or update repository secrets.
- The workflow receives full challenge values only through the two temporary Actions secrets.
- Full challenge values are masked before any command can emit them.
- Full values are never written to `$GITHUB_STEP_SUMMARY`, artifacts, cache, issues, pull requests, or normal environment files.
- The operator replaces the temporary secrets before every create operation and removes both names manually after the D1 delete succeeds. The workflow never receives repository-secrets write permission.
- The challenge expires after 15 minutes in D1 even if operator cleanup is missed.
- `create` and `delete` validate both supplied identifiers; `inspect` and `delete` reject rows outside the dedicated verification-user namespace.
- No production Android release, full backend deploy, or route change is part of this workflow.

## Operator Flow

1. Open `tools/admob-ssv-verification-values.html` locally and create fresh values. Keep that page open.
2. In GitHub repository settings, save the generated values as `ADMOB_SSV_TEST_USER_ID` and `ADMOB_SSV_TEST_CUSTOM_DATA`.
3. Run workflow command `create` with confirmation `MANAGE_ADMOB_SSV_CHALLENGE` and require redacted evidence showing a pending 15-minute challenge.
4. Enter the still-visible local values in AdMob URL verification.
5. Run AdMob's verification test.
6. Run workflow command `inspect` with confirmation `MANAGE_ADMOB_SSV_CHALLENGE` and require status `verified` with a transaction prefix.
7. Run workflow command `delete` with confirmation `MANAGE_ADMOB_SSV_CHALLENGE`; verify the challenge and now-unused temporary D1 user are gone, then delete `ADMOB_SSV_TEST_USER_ID` and `ADMOB_SSV_TEST_CUSTOM_DATA` manually in repository Actions settings.

## Failure Handling

- If either temporary secret is missing, malformed, or inconsistent, `create` fails before D1 access.
- If D1 insert fails, the workflow leaves the temporary secrets intact so the operator can retry or delete them manually.
- If manual secret cleanup is missed, the expired D1 challenge remains unusable; the operator must still remove both temporary repository secret names before the next verification run.
- Re-running `create` with the same values is rejected if the exact challenge already exists; the operator must inspect/delete it or generate a fresh pair.
- An expired or unverified challenge can be safely deleted and recreated.

## Testing

- Unit tests cover offline UUID/User ID generation helpers, supplied-value validation, SQL restrictions, redacted evidence, exact secret-name allowlisting, and manual-cleanup evidence.
- Browser tests assert the generator performs no network calls and uses no persistent storage.
- Workflow tests assert main-only/production gating, minimal permissions, no full-value output, exact secret names, operation ordering, absence of repository-secrets write permission, and manual-cleanup semantics.
- Secret scan and YAML parse remain mandatory.
- A dry-run test verifies that no workflow path can publish User ID or challenge UUID to logs or summaries.

## Out of Scope

- Automating the AdMob Console UI.
- Enabling Google Play production release.
- Changing the rewarded SSV route or full backend deployment.
- Persisting verification values beyond the operator's open offline page, the temporary D1 row, and two short-lived repository secrets.
