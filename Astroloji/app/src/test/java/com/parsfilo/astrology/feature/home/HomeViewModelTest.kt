package com.parsfilo.astrology.feature.home

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.ads.GoogleMobileAdsConsentManager
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.remote.MoodInsight
import com.parsfilo.astrology.core.data.remote.MoodInsightResponse
import com.parsfilo.astrology.core.data.remote.MoodLogResponse
import com.parsfilo.astrology.core.data.remote.StreakCheckInResponse
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.ContentRepository
import com.parsfilo.astrology.core.data.repository.FavoritesRepository
import com.parsfilo.astrology.core.data.repository.MoodRepository
import com.parsfilo.astrology.core.data.repository.RemoteConfigRepository
import com.parsfilo.astrology.core.data.repository.SessionRepository
import com.parsfilo.astrology.core.data.repository.StreakRepository
import com.parsfilo.astrology.core.domain.model.DailyHoroscope
import com.parsfilo.astrology.core.domain.model.RemoteFlags
import com.parsfilo.astrology.core.domain.model.UserPreferences
import com.parsfilo.astrology.core.domain.model.UserProfile
import com.parsfilo.astrology.core.domain.model.WeeklyHoroscope
import com.parsfilo.astrology.core.util.AppResult
import io.mockk.coEvery
import io.mockk.coJustRun
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test

private val TEST_PREFERENCES =
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

private val TEST_PROFILE =
    UserProfile(
        userId = "user",
        sign = "aries",
        language = "tr",
        isPremium = false,
        premiumExpiresAt = null,
        jwt = "jwt",
        utcOffset = 3,
        notificationEnabled = true,
        notificationHour = 9,
    )

private val TEST_DAILY =
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

private val TEST_WEEKLY =
    WeeklyHoroscope(
        week = "2026-W12",
        weekStart = "2026-03-16",
        weekEnd = "2026-03-22",
        sign = "aries",
        language = "tr",
        summary = "Hafta ozeti",
        love = "Ask",
        career = "Kariyer",
        money = "Para",
        bestDay = "Friday",
        warning = "Sabirli ol",
    )

private val NO_REWARD_CHECK_IN =
    StreakCheckInResponse(
        streakCount = 1,
        lastStreakDate = "2026-03-18",
        milestoneAchieved = null,
        creditsGranted = 0,
        balance = 0,
    )

private val NO_INSIGHT = MoodInsightResponse(insight = null)

@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val sessionRepository = mockk<SessionRepository>()
    private val contentRepository = mockk<ContentRepository>()
    private val favoritesRepository = mockk<FavoritesRepository>()
    private val preferencesRepository = mockk<UserPreferencesRepository>()
    private val analyticsRepository = mockk<AnalyticsRepository>()
    private val remoteConfigRepository = mockk<RemoteConfigRepository>()
    private val consentManager = mockk<GoogleMobileAdsConsentManager>()
    private val streakRepository = mockk<StreakRepository>()
    private val moodRepository = mockk<MoodRepository>()

    private fun stubDependencies() {
        coEvery { remoteConfigRepository.fetchFlags() } returns RemoteFlags(showPremiumBanner = true)
        coEvery { sessionRepository.loadProfile() } returns AppResult.Success(TEST_PROFILE)
        coEvery { preferencesRepository.current() } returns TEST_PREFERENCES
        coEvery { preferencesRepository.updateStreak(any(), any()) } returns Unit
        coEvery { favoritesRepository.getFavorites() } returns emptyList()
        coEvery { contentRepository.getDaily(any(), any(), any(), any()) } returns AppResult.Success(TEST_DAILY)
        coEvery { contentRepository.getWeekly(any(), any(), any(), any()) } returns AppResult.Success(TEST_WEEKLY)
        coJustRun { analyticsRepository.track(any(), any()) }
        every { consentManager.canRequestAds } returns false
        coEvery { streakRepository.checkIn() } returns AppResult.Success(NO_REWARD_CHECK_IN)
        coEvery { moodRepository.getInsight() } returns AppResult.Success(NO_INSIGHT)
    }

    private fun createViewModel(): HomeViewModel =
        HomeViewModel(
            sessionRepository = sessionRepository,
            contentRepository = contentRepository,
            favoritesRepository = favoritesRepository,
            preferencesRepository = preferencesRepository,
            analyticsRepository = analyticsRepository,
            remoteConfigRepository = remoteConfigRepository,
            consentManager = consentManager,
            streakRepository = streakRepository,
            moodRepository = moodRepository,
        )

    @Test
    fun `refresh event forces content refresh`() =
        runTest {
            stubDependencies()

            val viewModel = createViewModel()
            advanceUntilIdle()
            viewModel.onEvent(HomeUiEvent.Refresh)
            advanceUntilIdle()

            coVerify { contentRepository.getDaily("aries", "tr", any(), true) }
            coVerify { contentRepository.getWeekly("aries", "tr", any(), true) }
            assertThat(viewModel.state.value.isRefreshing).isFalse()
            assertThat(viewModel.state.value.daily).isEqualTo(TEST_DAILY)
            assertThat(viewModel.state.value.weekly).isEqualTo(TEST_WEEKLY)
        }

    @Test
    fun `a streak reward from check-in updates state and fires analytics`() =
        runTest {
            stubDependencies()
            coEvery { streakRepository.checkIn() } returns
                AppResult.Success(
                    StreakCheckInResponse(
                        streakCount = 7,
                        lastStreakDate = "2026-03-18",
                        milestoneAchieved = 7,
                        creditsGranted = 10,
                        balance = 10,
                    ),
                )

            val viewModel = createViewModel()
            advanceUntilIdle()

            assertThat(viewModel.state.value.streakCreditsGranted).isEqualTo(10)
            coVerify(exactly = 1) {
                analyticsRepository.track(
                    AnalyticsEvents.STREAK_ACHIEVED,
                    mapOf("milestone" to "7", "credits" to "10"),
                )
            }
        }

    @Test
    fun `logging a mood updates state and refreshes the insight`() =
        runTest {
            stubDependencies()
            coEvery { moodRepository.logMood("good", null) } returns
                AppResult.Success(MoodLogResponse(date = "2026-03-18", mood = "good", domain = null))
            coEvery { moodRepository.getInsight() } returnsMany
                listOf(
                    AppResult.Success(NO_INSIGHT),
                    AppResult.Success(MoodInsightResponse(insight = MoodInsight("communication", 3, 2))),
                )

            val viewModel = createViewModel()
            advanceUntilIdle()
            viewModel.onEvent(HomeUiEvent.LogMood("good", null))
            advanceUntilIdle()

            assertThat(viewModel.state.value.loggedMood).isEqualTo("good")
            assertThat(viewModel.state.value.moodInsight)
                .isEqualTo(MoodInsightUi("communication", 3, 2))
            coVerify(exactly = 1) { analyticsRepository.track(AnalyticsEvents.MOOD_LOGGED, mapOf("mood" to "good")) }
        }
}
