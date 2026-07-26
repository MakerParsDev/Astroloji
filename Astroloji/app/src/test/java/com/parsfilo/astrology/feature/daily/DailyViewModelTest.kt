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
import com.parsfilo.astrology.core.domain.model.RewardChallenge
import com.parsfilo.astrology.core.domain.model.UserPreferences
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import io.mockk.coEvery
import io.mockk.coJustRun
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DailyViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val contentRepository = mockk<ContentRepository>()
    private val preferencesRepository = mockk<UserPreferencesRepository>()
    private val analyticsRepository = mockk<AnalyticsRepository>()
    private val remoteConfigRepository = mockk<RemoteConfigRepository>()
    private val adEligibilityChecker = mockk<AdEligibilityChecker>()

    @Test
    fun `loads horoscope into state on success`() =
        runTest {
            val horoscope =
                DailyHoroscope(
                    date = "2026-03-18",
                    sign = "aries",
                    language = "tr",
                    short = "Bugun enerjin yuksek.",
                    full = "Tam yorum",
                    love = "Ask",
                    career = "Kariyer",
                    money = "Para",
                    health = "Saglik",
                    dailyTip = "Nefes al",
                    luckyNumber = 7,
                    luckyColor = "Kirmizi",
                    energy = 85,
                    loveScore = 70,
                    careerScore = 90,
                    moneyScore = 66,
                    healthScore = 74,
                )
            coEvery { preferencesRepository.current() } returns
                UserPreferences(
                    onboardingCompleted = true,
                    selectedSign = "aries",
                    language = "tr",
                    theme = "system",
                    notificationEnabled = true,
                    notificationHour = 9,
                    utcOffset = 3,
                    jwt = "jwt",
                    userId = "user",
                    isPremium = false,
                    premiumExpiresAt = null,
                    appOpenCount = 1,
                    lastStreakDate = null,
                    streakCount = 0,
                    lastInterstitialShown = 0L,
                    consentStatus = 0,
                )
            coEvery { contentRepository.getDaily(any(), any(), any(), any()) } returns AppResult.Success(horoscope)
            coJustRun { analyticsRepository.track(any(), any()) }
            coEvery { remoteConfigRepository.fetchFlags() } returns RemoteFlags()
            coEvery { adEligibilityChecker.canShowBannerAds() } returns false
            coEvery { adEligibilityChecker.canShowRewarded() } returns false

            val viewModel =
                DailyViewModel(
                    savedStateHandle = SavedStateHandle(mapOf("sign" to "aries")),
                    contentRepository = contentRepository,
                    preferencesRepository = preferencesRepository,
                    analyticsRepository = analyticsRepository,
                    remoteConfigRepository = remoteConfigRepository,
                    adEligibilityChecker = adEligibilityChecker,
                )

            advanceUntilIdle()

            assertThat(viewModel.state.value.horoscope).isEqualTo(horoscope)
            assertThat(viewModel.state.value.error).isNull()
            assertThat(viewModel.state.value.isLoading).isFalse()
        }

    @Test
    fun `sets error when repository returns failure`() =
        runTest {
            coEvery { preferencesRepository.current() } returns
                UserPreferences(
                    onboardingCompleted = true,
                    selectedSign = "aries",
                    language = "tr",
                    theme = "system",
                    notificationEnabled = true,
                    notificationHour = 9,
                    utcOffset = 3,
                    jwt = "jwt",
                    userId = "user",
                    isPremium = false,
                    premiumExpiresAt = null,
                    appOpenCount = 1,
                    lastStreakDate = null,
                    streakCount = 0,
                    lastInterstitialShown = 0L,
                    consentStatus = 0,
                )
            coEvery {
                contentRepository.getDaily(any(), any(), any(), any())
            } returns AppResult.Error(AppException.NetworkException("Baglanti hatasi"))
            coJustRun { analyticsRepository.track(any(), any()) }
            coEvery { remoteConfigRepository.fetchFlags() } returns RemoteFlags()
            coEvery { adEligibilityChecker.canShowBannerAds() } returns false
            coEvery { adEligibilityChecker.canShowRewarded() } returns false

            val viewModel =
                DailyViewModel(
                    savedStateHandle = SavedStateHandle(mapOf("sign" to "aries")),
                    contentRepository = contentRepository,
                    preferencesRepository = preferencesRepository,
                    analyticsRepository = analyticsRepository,
                    remoteConfigRepository = remoteConfigRepository,
                    adEligibilityChecker = adEligibilityChecker,
                )

            advanceUntilIdle()

            assertThat(viewModel.state.value.horoscope).isNull()
            assertThat(viewModel.state.value.error).isEqualTo("Baglanti hatasi")
            assertThat(viewModel.state.value.isLoading).isFalse()
        }

    @Test
    fun `refresh event bypasses cache`() =
        runTest {
            val horoscope =
                DailyHoroscope(
                    date = "2026-03-18",
                    sign = "aries",
                    language = "tr",
                    short = "Bugun enerjin yuksek.",
                    full = "Tam yorum",
                    love = "Ask",
                    career = "Kariyer",
                    money = "Para",
                    health = "Saglik",
                    dailyTip = "Nefes al",
                    luckyNumber = 7,
                    luckyColor = "Kirmizi",
                    energy = 85,
                    loveScore = 70,
                    careerScore = 90,
                    moneyScore = 66,
                    healthScore = 74,
                )
            coEvery { preferencesRepository.current() } returns
                UserPreferences(
                    onboardingCompleted = true,
                    selectedSign = "aries",
                    language = "tr",
                    theme = "system",
                    notificationEnabled = true,
                    notificationHour = 9,
                    utcOffset = 3,
                    jwt = "jwt",
                    userId = "user",
                    isPremium = false,
                    premiumExpiresAt = null,
                    appOpenCount = 1,
                    lastStreakDate = null,
                    streakCount = 0,
                    lastInterstitialShown = 0L,
                    consentStatus = 0,
                )
            coEvery { contentRepository.getDaily(any(), any(), any(), any()) } returns AppResult.Success(horoscope)
            coJustRun { analyticsRepository.track(any(), any()) }
            coEvery { remoteConfigRepository.fetchFlags() } returns RemoteFlags()
            coEvery { adEligibilityChecker.canShowBannerAds() } returns false
            coEvery { adEligibilityChecker.canShowRewarded() } returns false

            val viewModel =
                DailyViewModel(
                    savedStateHandle = SavedStateHandle(mapOf("sign" to "aries")),
                    contentRepository = contentRepository,
                    preferencesRepository = preferencesRepository,
                    analyticsRepository = analyticsRepository,
                    remoteConfigRepository = remoteConfigRepository,
                    adEligibilityChecker = adEligibilityChecker,
                )

            advanceUntilIdle()
            viewModel.onEvent(DailyUiEvent.Refresh)
            advanceUntilIdle()

            coVerify { contentRepository.getDaily("aries", "tr", any(), true) }
            assertThat(viewModel.state.value.isRefreshing).isFalse()
        }

    @Test
    fun `prepares SSV challenge before ad and claims only after reward callback`() =
        runTest {
            val locked = lockedDailyHoroscope()
            val unlocked =
                locked.copy(
                    full = "Tam yorum",
                    love = "Aşk",
                    career = "Kariyer",
                    money = "Para",
                    health = "Sağlık",
                    dailyTip = "İpucu",
                )
            val challenge = dailyRewardChallenge()
            coEvery { preferencesRepository.current() } returns
                UserPreferences(selectedSign = "aries", language = "tr", userId = "user-1")
            coEvery { remoteConfigRepository.fetchFlags() } returns
                RemoteFlags(showBannerAds = false, rewardedDailyUnlockLimit = 1)
            coEvery { adEligibilityChecker.canShowBannerAds() } returns false
            coEvery { adEligibilityChecker.canShowRewarded() } returns true
            coJustRun { analyticsRepository.track(any(), any()) }
            coEvery { contentRepository.getDaily(any(), any(), any(), any()) } returnsMany
                listOf(AppResult.Success(locked), AppResult.Success(unlocked))
            coEvery { contentRepository.prepareRewardUnlock("daily", any()) } returns AppResult.Success(challenge)
            coEvery { contentRepository.claimRewardUnlock(challenge.challengeId) } returns AppResult.Success(Unit)

            val viewModel =
                DailyViewModel(
                    savedStateHandle = SavedStateHandle(mapOf("sign" to "aries")),
                    contentRepository = contentRepository,
                    preferencesRepository = preferencesRepository,
                    analyticsRepository = analyticsRepository,
                    remoteConfigRepository = remoteConfigRepository,
                    adEligibilityChecker = adEligibilityChecker,
                )
            advanceUntilIdle()

            viewModel.onEvent(DailyUiEvent.UnlockWithReward)
            advanceUntilIdle()
            val effect = viewModel.effects.first()

            assertThat(effect).isEqualTo(DailyUiEffect.ShowRewardAd(challenge))
            coVerify(exactly = 0) { contentRepository.claimRewardUnlock(any()) }

            viewModel.onEvent(DailyUiEvent.RewardEarned(challenge.challengeId))
            advanceUntilIdle()

            coVerify(exactly = 1) { contentRepository.claimRewardUnlock(challenge.challengeId) }
            val unlockedFull =
                viewModel.state.value.horoscope
                    ?.full
            assertThat(unlockedFull).isEqualTo("Tam yorum")
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

    private fun dailyRewardChallenge(): RewardChallenge =
        RewardChallenge(
            challengeId = "challenge-1",
            customData = "challenge-1",
            userId = "user-1",
            rewardType = "daily",
            identifier = "2026-07-26",
            expiresAt = "2026-07-26T20:00:00.000Z",
        )
}
