package com.parsfilo.astrology.core.ads

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AdLoadRetryGateTest {
    @Test
    fun failureDelaysSubsequentPreloadUntilNextExistingTrigger() {
        var elapsedMs = 1_000L
        val gate = AdLoadRetryGate { elapsedMs }
        assertThat(gate.canLoad()).isTrue()

        gate.recordFailure()
        assertThat(gate.canLoad()).isFalse()
        elapsedMs += 29_999L
        assertThat(gate.canLoad()).isFalse()
        elapsedMs++
        assertThat(gate.canLoad()).isTrue()
    }

    @Test
    fun repeatedFailuresApplyBoundedExponentialBackoff() {
        var elapsedMs = 0L
        val gate = AdLoadRetryGate { elapsedMs }
        for (delay in listOf(30_000L, 60_000L, 120_000L, 240_000L, 300_000L, 300_000L)) {
            gate.recordFailure()
            elapsedMs += delay - 1L
            assertThat(gate.canLoad()).isFalse()
            elapsedMs++
            assertThat(gate.canLoad()).isTrue()
        }
    }

    @Test
    fun successfulLoadClearsBackoffAndSubsequentFailuresStartFromMinimum() {
        var elapsedMs = 0L
        val gate = AdLoadRetryGate { elapsedMs }
        gate.recordFailure()
        elapsedMs += 30_000L
        gate.recordFailure()
        assertThat(gate.canLoad()).isFalse()

        gate.recordSuccess()
        assertThat(gate.canLoad()).isTrue()
        gate.recordFailure()
        elapsedMs += 29_999L
        assertThat(gate.canLoad()).isFalse()
        elapsedMs++
        assertThat(gate.canLoad()).isTrue()
    }

    @Test
    fun consentRevisionChangeResetsOnlyThePreviousRevisionsBackoff() {
        var elapsedMs = 1_000L
        val gate = AdLoadRetryGate { elapsedMs }
        gate.scopeToConsentRevision(4L)
        gate.recordFailure()
        assertThat(gate.canLoad()).isFalse()

        gate.scopeToConsentRevision(4L)
        assertThat(gate.canLoad()).isFalse()

        gate.scopeToConsentRevision(5L)
        assertThat(gate.canLoad()).isTrue()

        gate.recordFailure()
        elapsedMs += 29_999L
        gate.scopeToConsentRevision(5L)
        assertThat(gate.canLoad()).isFalse()
        elapsedMs += 1L
        assertThat(gate.canLoad()).isTrue()
    }

    @Test
    fun wallClockChangesDoNotBypassMonotonicCooldown() {
        var elapsedMs = 10_000L
        val gate = AdLoadRetryGate { elapsedMs }
        gate.recordFailure()
        elapsedMs = 9_000L
        assertThat(gate.canLoad()).isFalse()
        elapsedMs = 40_000L
        assertThat(gate.canLoad()).isTrue()
    }
}
