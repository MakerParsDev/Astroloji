package com.parsfilo.astrology.core.data.preferences

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.domain.model.UserPreferences
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CachedPremiumExpiryTest {
    @Test
    fun `cached subscription is active until but not at its expiry`() {
        assertThat(isCachedPremiumUnexpired(true, 500L, 499L)).isTrue()
        assertThat(isCachedPremiumUnexpired(true, 500L, 500L)).isFalse()
        assertThat(isCachedPremiumUnexpired(true, 500L, 501L)).isFalse()
    }

    @Test
    fun `expired premium stays disabled after a fresh preferences read`() {
        val expiry = 1_783_020_000_000L
        assertThat(isCachedPremiumUnexpired(true, expiry, expiry + 60_000L)).isFalse()
    }

    @Test
    fun `non-premium stays disabled and missing historic expiry is unchanged`() {
        assertThat(isCachedPremiumUnexpired(false, null, 500L)).isFalse()
        assertThat(isCachedPremiumUnexpired(false, 1_000L, 500L)).isFalse()
        assertThat(isCachedPremiumUnexpired(true, null, 500L)).isTrue()
    }

    @Test
    fun `an observed premium stream expires without another DataStore write`() =
        runTest {
            val snapshots = MutableStateFlow(UserPreferences(isPremium = true, premiumExpiresAt = 1_000L))
            val received = mutableListOf<Boolean>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                refreshPremiumOnExpiry(snapshots, nowMillis = { testScheduler.currentTime })
                    .collect { received += it.isPremium }
            }

            assertThat(received).containsExactly(true)
            advanceTimeBy(999L)
            runCurrent()
            assertThat(received).containsExactly(true)
            advanceTimeBy(1L)
            runCurrent()
            assertThat(received).containsExactly(true, false).inOrder()
        }

    @Test
    fun `a new expiry replaces the old deadline and a cancellation goes free immediately`() =
        runTest {
            val snapshots = MutableStateFlow(UserPreferences(isPremium = true, premiumExpiresAt = 1_000L))
            val received = mutableListOf<Boolean>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                refreshPremiumOnExpiry(snapshots, nowMillis = { testScheduler.currentTime })
                    .collect { received += it.isPremium }
            }

            advanceTimeBy(500L)
            snapshots.value = snapshots.value.copy(premiumExpiresAt = 1_500L)
            runCurrent()
            advanceTimeBy(500L)
            runCurrent()
            assertThat(received).containsExactly(true, true).inOrder()
            snapshots.value = snapshots.value.copy(isPremium = false)
            runCurrent()
            advanceTimeBy(1_000L)
            runCurrent()
            assertThat(received).containsExactly(true, true, false).inOrder()
        }

    @Test
    fun `free and legacy premium streams need no timed refresh`() =
        runTest {
            val snapshots = MutableStateFlow(UserPreferences(isPremium = true, premiumExpiresAt = null))
            val received = mutableListOf<Boolean>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                refreshPremiumOnExpiry(snapshots, nowMillis = { testScheduler.currentTime })
                    .collect { received += it.isPremium }
            }

            advanceTimeBy(86_400_000L)
            runCurrent()
            assertThat(received).containsExactly(true)
            snapshots.value = snapshots.value.copy(isPremium = false)
            runCurrent()
            assertThat(received).containsExactly(true, false).inOrder()
        }
}
