package com.parsfilo.astrology.feature.personality

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.ContentRepository
import com.parsfilo.astrology.core.data.repository.FavoritesRepository
import com.parsfilo.astrology.core.domain.model.PersonalityReport
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
class PersonalityViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val contentRepository = mockk<ContentRepository>()
    private val preferencesRepository = mockk<UserPreferencesRepository>()
    private val analyticsRepository = mockk<AnalyticsRepository>()
    private val favoritesRepository = mockk<FavoritesRepository>()

    @Test
    fun `toggle favorite updates isFavorite state`() =
        runTest {
            val preferences =
                UserPreferences(
                    onboardingCompleted = true,
                    selectedSign = "leo",
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
                PersonalityReport(
                    sign = "aries",
                    language = "tr",
                    summary = "Lider ruhlusun.",
                    deepAnalysis = "Detayli yorum.",
                    strengths = listOf("Cesur"),
                    weaknesses = listOf("Sabirsiz"),
                    idealPartners = listOf("leo"),
                    careerFit = listOf("Girisimcilik"),
                    element = "ates",
                    planet = "mars",
                    color = "kirmizi",
                    stone = "yakut",
                )

            coEvery { preferencesRepository.current() } returns preferences
            coEvery { contentRepository.getPersonality(any(), any()) } returns AppResult.Success(report)
            coJustRun { analyticsRepository.track(any(), any()) }
            coEvery { favoritesRepository.getFavorites() } returnsMany listOf(emptyList(), listOf("aries"))
            coJustRun { favoritesRepository.toggle("aries") }

            val viewModel =
                PersonalityViewModel(
                    savedStateHandle = SavedStateHandle(mapOf("sign" to "aries")),
                    contentRepository = contentRepository,
                    preferencesRepository = preferencesRepository,
                    analyticsRepository = analyticsRepository,
                    favoritesRepository = favoritesRepository,
                )

            advanceUntilIdle()
            viewModel.onEvent(PersonalityUiEvent.ToggleFavorite)
            advanceUntilIdle()

            coVerify { favoritesRepository.toggle("aries") }
            assertThat(viewModel.state.value.isFavorite).isTrue()
        }
}
