# Rewarded SSV Transition Router Design

Date: 2026-07-26
Status: Proposed for implementation

## Problem

The secure rewarded-ad flow is merged into `main`, but the production Worker still runs the legacy client-authoritative reward contract. AdMob requires the callback URL to be verified before Server-Side Verification can be enabled. Deploying the full new backend immediately would make legacy production Android clients fail their old reward claim requests before the secure Android update has propagated through Google Play.

The rollout therefore needs an intermediate state that:

1. exposes the real signed AdMob callback endpoint;
2. supports the new authenticated `prepare -> SSV -> claim` flow for internal/release candidates;
3. keeps existing production clients working temporarily;
4. can be removed instantly without changing DNS or the existing production Worker;
5. never broadens the public attack surface beyond reward routes.

## Goals

- Route only `https://astrology.parsfilo.com/api/v1/rewards/*` through a dedicated transition Worker.
- Process secure `prepare`, SSV callback, and challenge-based `claim` requests using the same implementation already merged into the backend.
- Forward only the exact legacy client claim payload to the current production Custom Domain Worker during a time-bounded compatibility window.
- Verify AdMob's real ECDSA-signed test callback against Google-rotated public keys and the production rewarded ad-unit ID.
- Use the existing `astrology-db` D1 database and `CACHE` KV namespace so challenge and rate-limit state are shared with the future full backend deployment.
- Make rollback a route/Worker removal operation; the current Custom Domain Worker remains untouched until the compatibility flow is proven.
- Keep `ENABLE_PRODUCTION_RELEASE=false` throughout this transition.

## Non-goals

- No Google Play production rollout in this change.
- No Play Console Data Safety changes.
- No AdMob dashboard mutation through automation; the user still confirms and saves the callback in AdMob.
- No permanent support for legacy client-authoritative claims.
- No changes to horoscope content response shapes, subscriptions, notifications, or analytics.

## Architecture

### Existing origin Worker

`astrology-backend` remains attached to the Custom Domain `astrology.parsfilo.com`. It continues serving all paths as the origin Worker.

### Transition Worker

A second Worker named `astrology-ssv-transition` is deployed from the same backend repository with a focused entrypoint. It is attached to the Cloudflare route:

```text
astrology.parsfilo.com/api/v1/rewards/*
```

Cloudflare Routes run before a Worker Custom Domain on the same hostname. Calling `fetch(request)` from the route Worker invokes the existing Custom Domain Worker. The specific route is therefore both an interception point and a reversible proxy layer.

The Worker has:

- D1 binding `DB` -> `astrology-db`;
- KV binding `CACHE` -> the existing production cache namespace;
- secrets `JWT_SECRET` and `ADMOB_REWARDED_ID`;
- variable `LEGACY_REWARD_FORWARD_UNTIL` as an ISO-8601 UTC timestamp;
- `workers_dev = false`;
- no cron trigger, R2 binding, Firebase secret, Play secret, or admin secret.

### Request dispatch

The transition entrypoint accepts only the reward route prefix.

| Request | Behavior |
|---|---|
| `POST /api/v1/rewards/prepare` | Run the secure authenticated challenge preparation handler locally. |
| `GET /api/v1/rewards/ssv?...` | Verify the Google signature and update the matching D1 challenge locally. |
| `POST /api/v1/rewards/claim` with `challenge_id` UUID | Run the secure authenticated one-time claim handler locally. |
| `POST /api/v1/rewards/claim` with exact legacy `{reward_type, identifier}` payload | Forward the untouched request to the existing Custom Domain Worker only while the compatibility deadline is active. |
| Any malformed, mixed, additional-field, unsupported-method, or unsupported-path request | Reject without forwarding. |

The legacy payload classifier is fail-closed. It accepts exactly two JSON keys:

```json
{
  "reward_type": "daily | weekly",
  "identifier": "validated period identifier"
}
```

A payload containing `challenge_id`, extra keys, invalid JSON, or an invalid identifier is never forwarded as legacy traffic.

### Compatibility deadline

`LEGACY_REWARD_FORWARD_UNTIL` is mandatory and is evaluated on every legacy request. Once the current UTC time is at or after the deadline, legacy forwarding returns HTTP 410 with `LEGACY_REWARD_FLOW_EXPIRED`.

The initial deadline is set conservatively for the planned internal/closed-test period. Extending it requires an explicit configuration change and audit trail. The final secure cutover removes the transition route or disables legacy forwarding after the production Android rollout has reached the agreed adoption threshold.

## AdMob URL verification flow

The exact callback URL is `https://astrology.parsfilo.com/api/v1/rewards/ssv`.

1. Apply the additive `reward_challenges` D1 migration.
2. Deploy `astrology-ssv-transition` and attach the reward route.
3. Verify that unrelated endpoints still reach `astrology-backend` and that malformed SSV callbacks fail closed through the transition Worker.
4. Create a short-lived D1 verification challenge with:
   - a generated UUID challenge ID;
   - a generated test user ID prefixed `admob-verify-`;
   - status `pending`;
   - a 15-minute expiry;
   - reward type `daily` and the current UTC date identifier.
5. Enter the generated test user ID into AdMob's optional **User ID** field.
6. Enter the generated challenge UUID into AdMob's optional **Custom data** field.
7. Click **Verify URL**. The signed callback must return HTTP 200 and transition the challenge to `verified`.
8. Confirm the D1 row contains a transaction ID, callback timestamp, expected ad unit, and `verified_at` value without logging the raw callback or full user identifier.
9. Select **Use verified URL**, then save the ad unit.
10. Delete or expire the test challenge after evidence is recorded.

## Security properties

- Google ECDSA/SHA-256 signature verification uses the exact signed query bytes.
- Unknown Google key IDs are protected by the existing negative-refresh cooldown and upstream timeout.
- The callback must match the configured production rewarded ad unit.
- `user_id` and `custom_data` must match an unexpired pending D1 challenge.
- `transaction_id` remains unique and replay-resistant.
- Exact callback retries remain idempotent.
- Legacy forwarding cannot be reached through mixed/new payloads and cannot continue past the configured deadline.
- The transition Worker has the minimum required bindings and no `workers.dev` public endpoint.
- Logs contain request IDs and truncated identifiers only; no JWT, raw callback, signature, ad-unit secret value, or full user ID is logged.

## Deployment and rollback

### Deployment order

1. Merge and verify the transition Worker change.
2. Create a Cloudflare deployment review plan against the current `astrology-backend` deployment state.
3. Apply the D1 migration idempotently.
4. Deploy the transition Worker without a route or workers.dev endpoint, using the reviewed compatibility deadline.
5. Sync and verify only the required transition Worker secrets from Doppler while the Worker is still unrouted.
6. Attach `astrology.parsfilo.com/api/v1/rewards/*` through the Cloudflare Routes API only after the Worker and exact secret inventory are ready.
7. Run route isolation and legacy-forwarding smoke tests.
8. Provision the one-time AdMob verification challenge.
9. Have the user verify and save the callback URL in AdMob.
10. Run signed-callback evidence checks and Android internal preflight.

### Rollback

- Remove the specific reward route or delete `astrology-ssv-transition`.
- Requests immediately fall through to the unchanged `astrology-backend` Custom Domain Worker.
- The additive D1 table may remain; it does not affect the legacy backend.
- Do not deploy the full secure backend as part of rollback.

## Testing

### Unit tests

- Exact legacy payload is forwarded before the deadline.
- Legacy payload returns 410 at and after the deadline.
- Extra fields, mixed payloads, invalid identifiers, and invalid JSON are rejected locally.
- Secure `challenge_id` claims are never forwarded.
- Prepare and SSV requests are handled locally.
- Unsupported reward paths and methods are rejected.
- Forwarded requests preserve method, URL, authorization header, and body bytes.

### Worker runtime tests

- D1 and KV bindings initialize correctly.
- Malformed public SSV callback returns HTTP 400 with `MALFORMED_CALLBACK`.
- Legacy claim reaches a mocked origin only within the compatibility window.
- Secure prepare requires a valid app JWT.
- No non-reward route is served by the transition entrypoint.

### Deployment smoke tests

- `/api/v1/health` continues to return the existing origin Worker response.
- malformed `/api/v1/rewards/ssv` returns 400, not the old admin 403.
- a legacy claim with invalid authentication is forwarded and returns the origin's authentication response.
- an unsupported reward route fails locally and is not forwarded.
- Cloudflare route and Worker deployment IDs are recorded for rollback.

## Operational evidence

The rollout record must include:

- transition Worker deployment ID;
- route pattern and zone ID;
- D1 migration result;
- compatibility deadline;
- malformed-callback smoke result;
- AdMob verification challenge ID prefix and expiry only;
- verified D1 status and transaction ID prefix;
- rollback command/plan reference;
- internal preflight workflow URL and result.

## References

- Cloudflare Custom Domains interaction with Routes: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/#interaction-with-routes
- Cloudflare route matching and specificity: https://developers.cloudflare.com/workers/configuration/routing/routes/#matching-behavior
- AdMob SSV setup: https://developers.google.com/admob/android/ssv
