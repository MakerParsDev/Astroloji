package com.parsfilo.astrology.core.ads

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.domain.model.RemoteFlags
import com.parsfilo.astrology.core.domain.model.UserPreferences
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AdFrequencyManagerTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val preferencesRepository = mockk<UserPreferencesRepository>(relaxed = true)

    @Test
    fun `daily limit and cooldown are enforced for interstitials`() =
        runTest {
            coEvery { preferencesRepository.current() } returns
                UserPreferences(
                    lastInterstitialShown = 1_000L,
                    interstitialCountToday = 3,
                    interstitialCountDate = "1970-01-01",
                )

            val manager = AdFrequencyManager(preferencesRepository)
            val flags = RemoteFlags(interstitialDailyLimit = 3, interstitialCooldownMinutes = 5)

            assertThat(manager.canShowInterstitial(flags, nowMs = 2_000L)).isFalse()
            assertThat(manager.canShowInterstitial(flags, nowMs = 1_000L + (6 * 60 * 1000L))).isFalse()
        }

    @Test
    fun `new day resets interstitial counters and record updates persisted state`() =
        runTest {
            coEvery { preferencesRepository.current() } returns
                UserPreferences(
                    lastInterstitialShown = 0L,
                    interstitialCountToday = 2,
                    interstitialCountDate = "1970-01-01",
                )

            val manager = AdFrequencyManager(preferencesRepository)
            val flags = RemoteFlags(interstitialDailyLimit = 3, interstitialCooldownMinutes = 5)

            assertThat(manager.canShowInterstitial(flags, nowMs = 24 * 60 * 60 * 1000L)).isTrue()

            manager.recordInterstitialShown(nowMs = 24 * 60 * 60 * 1000L)

            coVerify {
                preferencesRepository.updateInterstitialMetrics(
                    lastShown = 24 * 60 * 60 * 1000L,
                    count = 1,
                    date = "1970-01-02",
                )
            }
        }
}
