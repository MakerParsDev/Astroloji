package com.parsfilo.astrology.core.ads

import android.os.SystemClock

/**
 * Caps retry requests following failed loads. No timer or background requests:
 * an existing preload trigger may retry only after this elapsed-time window.
 */
private const val INITIAL_RETRY_MS = 30_000L
private const val MAX_RETRY_MS = 300_000L
private const val MAX_BACKOFF_STEP = 5

internal class AdLoadRetryGate(
    private val elapsedRealtimeMs: () -> Long = SystemClock::elapsedRealtime,
) {
    private var failureCount = 0
    private var retryAfterMs = 0L
    private var consentRevision = Long.MIN_VALUE

    /**
     * A previous UMP snapshot's network failure cannot block newly permitted
     * requests. Repeated requests under the same revision retain backoff.
     */
    fun scopeToConsentRevision(revision: Long) {
        if (consentRevision == revision) return
        consentRevision = revision
        recordSuccess()
    }

    fun canLoad(): Boolean = failureCount == 0 || elapsedRealtimeMs() >= retryAfterMs

    fun recordFailure() {
        failureCount = (failureCount + 1).coerceAtMost(MAX_BACKOFF_STEP)
        val delayMs = (INITIAL_RETRY_MS shl (failureCount - 1)).coerceAtMost(MAX_RETRY_MS)
        retryAfterMs = elapsedRealtimeMs() + delayMs
    }

    fun recordSuccess() {
        failureCount = 0
        retryAfterMs = 0L
    }
}
