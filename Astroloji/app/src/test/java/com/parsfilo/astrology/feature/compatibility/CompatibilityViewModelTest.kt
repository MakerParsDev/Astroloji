package com.parsfilo.astrology.feature.compatibility

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.ads.AdEligibilityChecker
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.ContentRepository
import com.parsfilo.astrology.core.data.repository.FavoritesRepository
import com.parsfilo.astrology.core.data.repository.RemoteConfigRepository
import com.parsfilo.astrology.core.domain.model.CompatibilityReport
import com.parsfilo.astrology.core.domain.model.RemoteFlags
import com.parsfilo.astrology.core.domain.model.UserPreferences
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
class CompatibilityViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val preferencesRepository = mockk<UserPreferencesRepository>()
    private val contentRepository = mockk<ContentRepository>()
    private val analyticsRepository = mockk<AnalyticsRepository>()
    private val favoritesRepository = mockk<FavoritesRepository>()
    private val remoteConfigRepository = mockk<RemoteConfigRepository>()
    private val adEligibilityChecker = mockk<AdEligibilityChecker>()

    @Test
    fun `toggle favorite updates selected sign membership`() =
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
            val report =
                CompatibilityReport(
                    sign1 = "aries",
                    sign2 = "leo",
                    language = "tr",
                    overallScore = 88,
                    loveScore = 90,
                    friendshipScore = 84,
                    workScore = 80,
                    summary = "Uyumlu bir ikili.",
                    strengths = listOf("Enerji"),
                    challenges = listOf("Ego"),
                    advice = "Dengede kalin.",
                    famousCouples = emptyList(),
                )

            coEvery { preferencesRepository.current() } returns preferences
            coEvery { contentRepository.getCompatibility(any(), any(), any()) } returns AppResult.Success(report)
            coJustRun { analyticsRepository.track(any(), any()) }
            coEvery { favoritesRepository.getFavorites() } returnsMany listOf(emptyList(), listOf("leo"))
            coJustRun { favoritesRepository.toggle("leo") }
            coEvery { remoteConfigRepository.fetchFlags() } returns RemoteFlags()
            coEvery { adEligibilityChecker.canShowBannerAds() } returns false

            val viewModel =
                CompatibilityViewModel(
                    preferencesRepository = preferencesRepository,
                    contentRepository = contentRepository,
                    analyticsRepository = analyticsRepository,
                    favoritesRepository = favoritesRepository,
                    remoteConfigRepository = remoteConfigRepository,
                    adEligibilityChecker = adEligibilityChecker,
                )

            advanceUntilIdle()
            viewModel.onEvent(CompatibilityUiEvent.ToggleFavorite)
            advanceUntilIdle()

            coVerify { favoritesRepository.toggle("leo") }
            assertThat(viewModel.state.value.favorites).containsExactly("leo")
        }

    @Test
    fun `compatibility share click emits pair analytics without claiming completion`() =
        runTest {
            val preferences = UserPreferences(selectedSign = "aries", language = "en", userId = "user")
            val report =
                CompatibilityReport(
                    sign1 = "aries",
                    sign2 = "leo",
                    language = "en",
                    overallScore = 78,
                    loveScore = null,
                    friendshipScore = null,
                    workScore = null,
                    summary = "A balanced pair.",
                    strengths = emptyList(),
                    challenges = emptyList(),
                    advice = null,
                    famousCouples = emptyList(),
                )
            coEvery { preferencesRepository.current() } returns preferences
            coEvery { contentRepository.getCompatibility(any(), any(), any()) } returns AppResult.Success(report)
            coJustRun { analyticsRepository.track(any(), any()) }
            coEvery { favoritesRepository.getFavorites() } returns emptyList()
            coEvery { remoteConfigRepository.fetchFlags() } returns RemoteFlags(showBannerAds = false)
            coEvery { adEligibilityChecker.canShowBannerAds() } returns false
            val viewModel =
                CompatibilityViewModel(
                    preferencesRepository = preferencesRepository,
                    contentRepository = contentRepository,
                    analyticsRepository = analyticsRepository,
                    favoritesRepository = favoritesRepository,
                    remoteConfigRepository = remoteConfigRepository,
                    adEligibilityChecker = adEligibilityChecker,
                )
            advanceUntilIdle()

            viewModel.onEvent(CompatibilityUiEvent.ShareClicked)
            advanceUntilIdle()

            coVerify(exactly = 1) {
                analyticsRepository.track(
                    AnalyticsEvents.SHARE_CLICKED,
                    mapOf(
                        "source" to "compatibility",
                        "sign1" to "aries",
                        "sign2" to "leo",
                        "format" to "text_link",
                    ),
                )
            }
            coVerify(exactly = 0) {
                analyticsRepository.track(AnalyticsEvents.SHARE_COMPLETED, any())
            }
        }
}
