# Secure AdMob Verification Challenge Workflow Design

## Context

The rewarded SSV transition Worker is live at `https://astrology.parsfilo.com/api/v1/rewards/ssv` and correctly rejects malformed callbacks with `400 / MALFORMED_CALLBACK`. AdMob URL verification still requires a short-lived D1 challenge containing a full `user_id` and challenge UUID (`custom_data`). Existing operations machines do not have a usable local Doppler session, and printing the values in GitHub Actions logs would expose them to repository readers.

## Goal

Provide a main-only, auditable GitHub Actions workflow that can create, inspect, and delete a short-lived AdMob verification challenge without placing the full User ID or Custom data value in workflow logs, job summaries, artifacts, issues, or pull requests.

## Selected Approach

Use one `workflow_dispatch` workflow with three commands: `create`, `inspect`, and `delete`.

For `create`:

1. Validate that the workflow runs from `main` in the `production` environment.
2. Load the Cloudflare API token through Doppler and mask it immediately.
3. Generate the challenge values inside the runner.
4. Insert the pending challenge into production D1 using the existing transition Wrangler configuration.
5. Store the full User ID and Custom data as short-lived repository secrets named `ADMOB_SSV_TEST_USER_ID` and `ADMOB_SSV_TEST_CUSTOM_DATA` using the GitHub API.
6. Store only redacted prefixes and expiration time in the job summary.

For `inspect`:

1. Accept the challenge UUID through the encrypted `ADMOB_SSV_TEST_CUSTOM_DATA` secret, not as a workflow input.
2. Query D1 and publish only redacted evidence: challenge prefix, status, transaction prefix, and expiration.
3. Fail if the row is absent or does not belong to the `admob-verify-` namespace.

For `delete`:

1. Delete only the exact challenge UUID when its user ID starts with `admob-verify-`.
2. Remove both temporary repository secrets after the D1 deletion succeeds.
3. Publish only the deleted challenge prefix.

## Security Boundaries

- The workflow has `contents: read` and uses an explicit GitHub App/CLI token only for the two temporary secret writes/deletes.
- Full challenge values are masked before any command can emit them.
- Full values are never written to `$GITHUB_STEP_SUMMARY`, artifacts, cache, issues, pull requests, or normal environment files.
- The temporary secrets are replaced on every create operation and deleted after cleanup.
- The challenge expires after 15 minutes in D1 even if operator cleanup is missed.
- `inspect` and `delete` reject malformed UUIDs and rows outside the dedicated verification-user namespace.
- No production Android release, full backend deploy, or route change is part of this workflow.

## Operator Flow

1. Run `create`.
2. Read the two values from repository Actions secrets through the authorized operator path; do not copy them into tickets or chat logs.
3. Enter them in AdMob URL verification:
   - User ID: `ADMOB_SSV_TEST_USER_ID`
   - Custom data: `ADMOB_SSV_TEST_CUSTOM_DATA`
4. Run AdMob's verification test.
5. Run `inspect` and require status `verified` with a transaction prefix.
6. Run `delete`; verify the D1 row and both temporary repository secrets are gone.

## Failure Handling

- If D1 insert fails, no repository secrets are written.
- If the first secret write succeeds and the second fails, the workflow deletes the first secret before failing.
- If secret cleanup fails after D1 deletion, the workflow fails loudly and provides exact secret names to remove manually, without printing their values.
- Re-running `create` replaces any stale temporary secret values and creates a fresh 15-minute challenge.
- An expired or unverified challenge can be safely deleted and recreated.

## Testing

- Unit tests cover deterministic challenge generation, SQL restrictions, redacted evidence, secret-name allowlisting, and rollback behavior for partial secret writes.
- Workflow tests assert main-only/production gating, minimal permissions, no full-value output, exact secret names, operation ordering, and cleanup semantics.
- Secret scan and YAML parse remain mandatory.
- A dry-run test verifies that no workflow path can publish User ID or challenge UUID to logs or summaries.

## Out of Scope

- Automating the AdMob Console UI.
- Enabling Google Play production release.
- Changing the rewarded SSV route or full backend deployment.
- Persisting verification values beyond the temporary D1 row and two short-lived repository secrets.
