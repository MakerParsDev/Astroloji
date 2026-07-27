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
5. Insert the pending challenge into production D1 using the exact supplied values and the existing transition Wrangler configuration.
6. Store only redacted prefixes and expiration time in the job summary.

For `inspect`:

1. Accept the challenge UUID through the encrypted `ADMOB_SSV_TEST_CUSTOM_DATA` secret, not as a workflow input.
2. Query D1 and publish only redacted evidence: challenge prefix, status, transaction prefix, and expiration.
3. Fail if the row is absent or does not belong to the `admob-verify-` namespace.

For `delete`:

1. Delete only the exact challenge UUID when its user ID starts with `admob-verify-`.
2. Remove both temporary repository secrets after the D1 deletion succeeds by using the production environment secret `ADMOB_SSV_SECRET_ADMIN_TOKEN`, which has only repository Actions-secrets write permission.
3. Publish only the deleted challenge prefix.

## Security Boundaries

- The workflow has `contents: read`; it does not create or update repository secrets.
- The workflow receives full challenge values only through the two temporary Actions secrets.
- Full challenge values are masked before any command can emit them.
- Full values are never written to `$GITHUB_STEP_SUMMARY`, artifacts, cache, issues, pull requests, or normal environment files.
- The operator replaces the temporary secrets before every create operation. The delete command removes both temporary secrets after D1 cleanup through a narrowly scoped GitHub token supplied only to that cleanup step.
- The challenge expires after 15 minutes in D1 even if operator cleanup is missed.
- `inspect` and `delete` reject malformed UUIDs and rows outside the dedicated verification-user namespace.
- No production Android release, full backend deploy, or route change is part of this workflow.

## Operator Flow

1. Open `tools/admob-ssv-verification-values.html` locally and create fresh values. Keep that page open.
2. In GitHub repository settings, save the generated values as `ADMOB_SSV_TEST_USER_ID` and `ADMOB_SSV_TEST_CUSTOM_DATA`.
3. Confirm `ADMOB_SSV_SECRET_ADMIN_TOKEN` exists in the production environment, then run workflow command `create` with confirmation `MANAGE_ADMOB_SSV_CHALLENGE` and require redacted evidence showing a pending 15-minute challenge.
4. Enter the still-visible local values in AdMob URL verification.
5. Run AdMob's verification test.
6. Run workflow command `inspect` with confirmation `MANAGE_ADMOB_SSV_CHALLENGE` and require status `verified` with a transaction prefix.
7. Run workflow command `delete` with confirmation `MANAGE_ADMOB_SSV_CHALLENGE`; verify the D1 row and both temporary repository secrets are gone.

## Failure Handling

- If either temporary secret is missing, malformed, or inconsistent, `create` fails before D1 access.
- If D1 insert fails, the workflow leaves the temporary secrets intact so the operator can retry or delete them manually.
- If secret cleanup fails after D1 deletion, the workflow fails loudly and provides exact secret names to remove manually, without printing their values.
- Re-running `create` with the same values is rejected if the exact challenge already exists; the operator must inspect/delete it or generate a fresh pair.
- An expired or unverified challenge can be safely deleted and recreated.

## Testing

- Unit tests cover offline UUID/User ID generation helpers, supplied-value validation, SQL restrictions, redacted evidence, exact secret-name allowlisting, and idempotent cleanup behavior.
- Browser tests assert the generator performs no network calls and uses no persistent storage.
- Workflow tests assert main-only/production gating, minimal permissions, no full-value output, exact secret names, operation ordering, and cleanup semantics.
- Secret scan and YAML parse remain mandatory.
- A dry-run test verifies that no workflow path can publish User ID or challenge UUID to logs or summaries.

## Out of Scope

- Automating the AdMob Console UI.
- Enabling Google Play production release.
- Changing the rewarded SSV route or full backend deployment.
- Persisting verification values beyond the operator's open offline page, the temporary D1 row, and two short-lived repository secrets.
