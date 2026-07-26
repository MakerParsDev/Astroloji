package com.parsfilo.astrology.feature.weekly

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.ads.AdEligibilityChecker
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.ContentRepository
import com.parsfilo.astrology.core.data.repository.RemoteConfigRepository
import com.parsfilo.astrology.core.domain.model.RemoteFlags
import com.parsfilo.astrology.core.domain.model.UserPreferences
import com.parsfilo.astrology.core.domain.model.WeeklyHoroscope
import com.parsfilo.astrology.core.util.AppResult
import io.mockk.coEvery
import io.mockk.coJustRun
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WeeklyViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val contentRepository = mockk<ContentRepository>()
    private val preferencesRepository = mockk<UserPreferencesRepository>()
    private val analyticsRepository = mockk<AnalyticsRepository>()
    private val remoteConfigRepository = mockk<RemoteConfigRepository>()
    private val adEligibilityChecker = mockk<AdEligibilityChecker>()

    @Test
    fun `selects the first locked premium section for the reward action`() {
        val weekly =
            weekly(
                love = "Aşk",
                career = null,
                money = null,
            )

        assertThat(firstLockedWeeklyPremiumSection(weekly)).isEqualTo(WeeklyPremiumSection.CAREER)
        assertThat(isWeeklyPremiumContentLocked(weekly)).isTrue()
    }

    @Test
    fun `does not offer reward when all lockable premium sections are available`() {
        val weekly =
            weekly(
                love = "Aşk",
                career = "Kariyer",
                money = "Para",
            )

        assertThat(firstLockedWeeklyPremiumSection(weekly)).isNull()
        assertThat(isWeeklyPremiumContentLocked(weekly)).isFalse()
    }

    @Test
    fun `offers rewarded unlock when free summary exists but premium fields are locked`() =
        runTest {
            val weekly =
                WeeklyHoroscope(
                    week = "2026-W30",
                    weekStart = "2026-07-20",
                    weekEnd = "2026-07-26",
                    sign = "aries",
                    language = "tr",
                    summary = "Haftanın ücretsiz özeti",
                    love = null,
                    career = null,
                    money = null,
                    bestDay = null,
                    warning = null,
                )
            coEvery { preferencesRepository.current() } returns UserPreferences(selectedSign = "aries", language = "tr")
            coEvery { remoteConfigRepository.fetchFlags() } returns
                RemoteFlags(
                    showBannerAds = false,
                    rewardedDailyUnlockLimit = 1,
                )
            coEvery { adEligibilityChecker.canShowBannerAds() } returns false
            coEvery { adEligibilityChecker.canShowRewarded() } returns true
            coJustRun { analyticsRepository.track(any(), any()) }
            coEvery { contentRepository.getWeekly(any(), any(), any(), any()) } returns AppResult.Success(weekly)

            val viewModel =
                WeeklyViewModel(
                    savedStateHandle = SavedStateHandle(mapOf("sign" to "aries")),
                    contentRepository = contentRepository,
                    preferencesRepository = preferencesRepository,
                    analyticsRepository = analyticsRepository,
                    remoteConfigRepository = remoteConfigRepository,
                    adEligibilityChecker = adEligibilityChecker,
                )

            advanceUntilIdle()

            assertThat(viewModel.state.value.weekly).isEqualTo(weekly)
            assertThat(viewModel.state.value.canUnlockWithReward).isTrue()
        }

    private fun weekly(
        love: String?,
        career: String?,
        money: String?,
    ): WeeklyHoroscope =
        WeeklyHoroscope(
            week = "2026-W30",
            weekStart = "2026-07-20",
            weekEnd = "2026-07-26",
            sign = "aries",
            language = "tr",
            summary = "Haftanın ücretsiz özeti",
            love = love,
            career = career,
            money = money,
            bestDay = null,
            warning = null,
        )
}
