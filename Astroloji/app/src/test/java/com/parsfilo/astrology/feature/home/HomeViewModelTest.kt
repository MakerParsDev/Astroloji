package com.parsfilo.astrology.feature.home

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.ads.GoogleMobileAdsConsentManager
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.ContentRepository
import com.parsfilo.astrology.core.data.repository.FavoritesRepository
import com.parsfilo.astrology.core.data.repository.RemoteConfigRepository
import com.parsfilo.astrology.core.data.repository.SessionRepository
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

    @Test
    fun `refresh event forces content refresh`() =
        runTest {
            val preferences =
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
            val profile =
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
            val daily =
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
            val weekly =
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

            coEvery { remoteConfigRepository.fetchFlags() } returns RemoteFlags(showPremiumBanner = true)
            coEvery { sessionRepository.loadProfile() } returns AppResult.Success(profile)
            coEvery { preferencesRepository.current() } returns preferences
            coEvery { preferencesRepository.updateStreak(any(), any()) } returns Unit
            coEvery { favoritesRepository.getFavorites() } returns emptyList()
            coEvery { contentRepository.getDaily(any(), any(), any(), any()) } returns AppResult.Success(daily)
            coEvery { contentRepository.getWeekly(any(), any(), any(), any()) } returns AppResult.Success(weekly)
            coJustRun { analyticsRepository.track(any(), any()) }
            every { consentManager.canRequestAds } returns false

            val viewModel =
                HomeViewModel(
                    sessionRepository = sessionRepository,
                    contentRepository = contentRepository,
                    favoritesRepository = favoritesRepository,
                    preferencesRepository = preferencesRepository,
                    analyticsRepository = analyticsRepository,
                    remoteConfigRepository = remoteConfigRepository,
                    consentManager = consentManager,
                )

            advanceUntilIdle()
            viewModel.onEvent(HomeUiEvent.Refresh)
            advanceUntilIdle()

            coVerify { contentRepository.getDaily("aries", "tr", any(), true) }
            coVerify { contentRepository.getWeekly("aries", "tr", any(), true) }
            assertThat(viewModel.state.value.isRefreshing).isFalse()
            assertThat(viewModel.state.value.daily).isEqualTo(daily)
            assertThat(viewModel.state.value.weekly).isEqualTo(weekly)
        }
}
