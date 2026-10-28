package com.parsfilo.astrology.feature.daily

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.ads.AdEligibilityChecker
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.ContentRepository
import com.parsfilo.astrology.core.data.repository.RemoteConfigRepository
import com.parsfilo.astrology.core.domain.model.DailyHoroscope
import com.parsfilo.astrology.core.domain.model.RemoteFlags
import com.parsfilo.astrology.core.domain.model.UserPreferences
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import io.mockk.coEvery
import io.mockk.coJustRun
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DailyRewardExpiryRecoveryTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val contentRepository = mockk<ContentRepository>()
    private val preferencesRepository = mockk<UserPreferencesRepository>()
    private val analyticsRepository = mockk<AnalyticsRepository>()
    private val remoteConfigRepository = mockk<RemoteConfigRepository>()
    private val adEligibilityChecker = mockk<AdEligibilityChecker>()

    @Test
    fun `terminal daily reward expiry clears saved pending claim and permits new preparation`() =
        runTest {
            val saved = SavedStateHandle(mapOf("sign" to "aries", "pendingRewardChallengeId" to "expired-daily"))
            coEvery { preferencesRepository.current() } returns UserPreferences(selectedSign = "aries", language = "tr")
            coEvery { remoteConfigRepository.fetchFlags() } returns
                RemoteFlags(showBannerAds = false, rewardedDailyUnlockLimit = 1)
            coEvery { adEligibilityChecker.canShowBannerAds() } returns false
            coEvery { adEligibilityChecker.canShowRewarded() } returns true
            coJustRun { analyticsRepository.track(any(), any()) }
            coEvery { contentRepository.getDaily(any(), any(), any(), any()) } returns
                AppResult.Success(lockedDailyHoroscope())
            coEvery { contentRepository.claimRewardUnlock("expired-daily") } returns
                AppResult.Error(AppException.RewardChallengeExpiredException())
            coEvery { contentRepository.prepareRewardUnlock("daily", any()) } returns AppResult.Loading

            val model =
                DailyViewModel(
                    savedStateHandle = saved,
                    contentRepository = contentRepository,
                    preferencesRepository = preferencesRepository,
                    analyticsRepository = analyticsRepository,
                    remoteConfigRepository = remoteConfigRepository,
                    adEligibilityChecker = adEligibilityChecker,
                )
            advanceUntilIdle()
            model.onEvent(DailyUiEvent.RetryRewardVerification)
            advanceUntilIdle()

            assertThat(model.state.value.pendingRewardChallengeId).isNull()
            assertThat(saved.get<String>("pendingRewardChallengeId")).isNull()
            assertThat(model.state.value.error).contains("expired")

            model.onEvent(DailyUiEvent.UnlockWithReward)
            advanceUntilIdle()
            coVerify(exactly = 1) { contentRepository.prepareRewardUnlock("daily", any()) }
            coVerify(exactly = 1) { contentRepository.claimRewardUnlock("expired-daily") }
        }

    private fun lockedDailyHoroscope(): DailyHoroscope =
        DailyHoroscope(
            date = "2026-07-26",
            sign = "aries",
            language = "tr",
            short = "Kısa",
            full = null,
            love = null,
            career = null,
            money = null,
            health = null,
            dailyTip = null,
            luckyNumber = 7,
            luckyColor = "Mavi",
            energy = 80,
            loveScore = 70,
            careerScore = 70,
            moneyScore = 70,
            healthScore = 70,
        )
}
