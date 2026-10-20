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
import java.time.LocalDate
import java.time.ZoneId

@OptIn(ExperimentalCoroutinesApi::class)
class AdFrequencyManagerTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val preferencesRepository = mockk<UserPreferencesRepository>(relaxed = true)

    @Test
    fun `daily limit and cooldown are enforced for interstitials`() =
        runTest {
            val localMidnight = LocalDate.of(1970, 1, 1).atStartOfDay(ZoneId.systemDefault())
            val startOfTestDay = localMidnight.toInstant().toEpochMilli()
            coEvery { preferencesRepository.current() } returns
                UserPreferences(
                    lastInterstitialShown = startOfTestDay + 1_000L,
                    interstitialCountToday = 3,
                    interstitialCountDate = "1970-01-01",
                )

            val manager = AdFrequencyManager(preferencesRepository)
            val flags = RemoteFlags(interstitialDailyLimit = 3, interstitialCooldownMinutes = 5)

            assertThat(manager.canShowInterstitial(flags, nowMs = startOfTestDay + 2_000L)).isFalse()
            assertThat(manager.canShowInterstitial(flags, nowMs = startOfTestDay + 1_000L + (6 * 60 * 1000L))).isFalse()
        }

    @Test
    fun `a zero daily limit disables interstitials even at midnight rollover`() =
        runTest {
            coEvery { preferencesRepository.current() } returns
                UserPreferences(
                    lastInterstitialShown = 0L,
                    interstitialCountToday = 0,
                    interstitialCountDate = "1970-01-01",
                )

            val manager = AdFrequencyManager(preferencesRepository)
            val flags = RemoteFlags(interstitialDailyLimit = 0, interstitialCooldownMinutes = 0)

            assertThat(manager.canShowInterstitial(flags, nowMs = 0L)).isFalse()
            assertThat(manager.canShowInterstitial(flags, nowMs = 24 * 60 * 60 * 1000L)).isFalse()
        }

    @Test
    fun `cooldown remains enforced when the calendar day changes`() =
        runTest {
            val localMidnight = LocalDate.of(1970, 1, 2).atStartOfDay(ZoneId.systemDefault())
            val startOfNewDay = localMidnight.toInstant().toEpochMilli()
            coEvery { preferencesRepository.current() } returns
                UserPreferences(
                    lastInterstitialShown = startOfNewDay - 60_000L,
                    interstitialCountToday = 3,
                    interstitialCountDate = "1970-01-01",
                )

            val manager = AdFrequencyManager(preferencesRepository)
            val flags = RemoteFlags(interstitialDailyLimit = 3, interstitialCooldownMinutes = 5)

            assertThat(manager.canShowInterstitial(flags, nowMs = startOfNewDay)).isFalse()
            assertThat(manager.canShowInterstitial(flags, nowMs = startOfNewDay + 5 * 60_000L)).isTrue()
        }

    @Test
    fun `new day resets interstitial counters and record updates persisted state`() =
        runTest {
            val localMidnight = LocalDate.of(1970, 1, 2).atStartOfDay(ZoneId.systemDefault())
            val startOfNewDay = localMidnight.toInstant().toEpochMilli()
            coEvery { preferencesRepository.current() } returns
                UserPreferences(
                    lastInterstitialShown = 0L,
                    interstitialCountToday = 2,
                    interstitialCountDate = "1970-01-01",
                )

            val manager = AdFrequencyManager(preferencesRepository)
            val flags = RemoteFlags(interstitialDailyLimit = 3, interstitialCooldownMinutes = 5)

            assertThat(manager.canShowInterstitial(flags, nowMs = startOfNewDay)).isTrue()

            manager.recordInterstitialShown(nowMs = startOfNewDay)

            coVerify {
                preferencesRepository.updateInterstitialMetrics(
                    lastShown = startOfNewDay,
                    count = 1,
                    date = "1970-01-02",
                )
            }
        }
}
