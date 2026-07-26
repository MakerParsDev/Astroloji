# Release Reliability Hardening Design

## Scope

This tranche fixes three release-blocking correctness problems without adding dependencies or changing public endpoint paths:

1. Android analytics event names do not match the backend allowlist, and permanently rejected events can remain in an unbounded offline queue.
2. Weekly rewarded access is gated by `summary == null`, although the free backend response includes `summary`; the reward action therefore remains hidden.
3. User registration requires an FCM token, causing Android to generate synthetic tokens when Firebase Messaging is temporarily unavailable.

Reward server-side verification, Play RTDN authentication, and atomic backend rate limiting remain separate security projects and are not weakened or partially redesigned here.

## Architecture

### Analytics contract

The Android `AnalyticsEvents` constants are the canonical mobile event vocabulary. The backend keeps legacy event names for compatibility but must accept every canonical mobile event. A backend contract test reads the Kotlin constants and verifies that each is present in `USER_EVENT_TYPES`, preventing future cross-language drift.

### Offline analytics queue

Only retryable failures are queued:

- Network exceptions and HTTP 5xx are retryable.
- HTTP 408 and 429 are retryable.
- Other HTTP 4xx responses are permanent and are not queued.

The Room DAO owns bounded insertion as one transaction. Before and after insertion it removes events older than 30 days and evicts the oldest records above a 500-event cap. Synchronization reads at most 50 records. Successful and permanently rejected records are deleted. A transient response or exception stops the batch and returns `Result.retry()` so WorkManager applies its configured backoff.

Malformed queued JSON is treated as permanently invalid and deleted rather than retried forever.

### Weekly reward eligibility

Weekly rewarded access is available when rewarded ads are allowed and one of the visible reward-capable premium cards (`love`, `career`, or `money`) is missing. The eligibility decision and first locked section are derived by shared pure functions covered by JVM tests. The overview card remains visible as free content; the reward button is attached to the first locked card, so partial payloads cannot produce an eligible state with no visible action. Missing optional highlights such as `bestDay` or `warning` do not by themselves create reward eligibility.

### Optional FCM registration

`fcm_token` becomes optional in the backend register request and nullable/omitted in the Android request model. Android attempts to fetch the real Firebase token but never synthesizes one. The backend upserts an FCM record only when a real nonblank token is supplied. User/session registration must still succeed without notification capability.

## Compatibility

- Existing clients that send a real `fcm_token` continue to work.
- Legacy backend analytics event names remain accepted.
- No database migration is required because the queue schema is unchanged.
- No new library is introduced.

## Error handling

- Analytics permanent 4xx responses are dropped with sanitized logs.
- Analytics transient failures are queued or retried without logging payload contents.
- Missing FCM token is a normal state, not an error.
- Weekly reward eligibility is derived only from visible reward-capable content cards and ad eligibility; it does not grant access by itself.

## Verification

- Backend analytics contract test fails before the allowlist change and passes afterward.
- Backend validator and user route tests cover registration without `fcm_token`.
- Android repository tests cover transient queueing and permanent rejection.
- An in-memory Room test proves 30-day pruning and 500-event oldest-first eviction in the real DAO implementation.
- Android policy and Worker tests cover response classification, malformed payload deletion, the 50-event batch limit, delivery deletion, and retry behavior.
- Weekly ViewModel tests cover free summary, partial premium payloads, first-locked-section selection, and the absence of false eligibility when all visible reward-capable cards are present.
- Session repository tests prove no synthetic FCM token is sent, and serialization tests prove a null token is omitted from the Retrofit JSON payload.
- Backend build, full unit/runtime tests, Android full JVM tests, debug assembly, Detekt, ktlint, diff checks, and secret scanning pass.
