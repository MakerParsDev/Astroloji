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

Weekly rewarded access is available when rewarded ads are allowed and any premium weekly field is missing. The eligibility decision is a small pure function covered by JVM tests. The overview card remains visible as free content; the reward button is attached to the first locked premium section rather than requiring `summary` to be locked.

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
- Weekly reward eligibility is derived only from content fields and ad eligibility; it does not grant access by itself.

## Verification

- Backend analytics contract test fails before the allowlist change and passes afterward.
- Backend validator and user route tests cover registration without `fcm_token`.
- Android repository tests cover transient queueing and permanent rejection.
- Android sync policy tests cover response classification, malformed payload deletion, batch limits, and retry behavior.
- Weekly ViewModel tests cover free summary with locked premium fields.
- Session repository tests prove no synthetic FCM token is sent.
- Backend build/tests and targeted Android unit tests pass, followed by Detekt and ktlint.
