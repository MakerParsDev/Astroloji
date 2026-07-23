package com.parsfilo.astrology.feature.onboarding

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.SessionRepository
import com.parsfilo.astrology.core.domain.model.UserPreferences
import com.parsfilo.astrology.core.domain.model.UserProfile
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.StringsProvider
import com.parsfilo.astrology.core.util.ZodiacSign
import io.mockk.coEvery
import io.mockk.coJustRun
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class OnboardingViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val preferencesRepository = mockk<UserPreferencesRepository>()
    private val sessionRepository = mockk<SessionRepository>()
    private val stringsProvider = mockk<StringsProvider>()

    @Test
    fun `complete surfaces a validation error when no sign is selected`() =
        runTest {
            coEvery { stringsProvider.get(any()) } returns "Lutfen burcunuzu secin"

            val viewModel =
                OnboardingViewModel(
                    preferencesRepository = preferencesRepository,
                    sessionRepository = sessionRepository,
                    stringsProvider = stringsProvider,
                )

            viewModel.complete {}
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.error).isEqualTo("Lutfen burcunuzu secin")
            assertThat(viewModel.uiState.value.isSubmitting).isFalse()
        }

    @Suppress("LongMethod")
    @Test
    fun `retryLastSubmission retries onboarding registration after a failure`() =
        runTest {
            val basePreferences =
                UserPreferences(
                    onboardingCompleted = false,
                    selectedSign = ZodiacSign.ARIES.key,
                    language = "en",
                    theme = "dark",
                    notificationEnabled = true,
                    notificationHour = 9,
                    utcOffset = 3,
                    jwt = null,
                    userId = null,
                    isPremium = false,
                    premiumExpiresAt = null,
                    appOpenCount = 0,
                    lastStreakDate = null,
                    streakCount = 0,
                    lastInterstitialShown = 0L,
                    consentStatus = 0,
                )
            val profile =
                UserProfile(
                    userId = "user-1",
                    sign = ZodiacSign.ARIES.key,
                    language = "en",
                    isPremium = false,
                    premiumExpiresAt = null,
                    jwt = "jwt",
                    utcOffset = 3,
                    notificationEnabled = true,
                    notificationHour = 9,
                )

            coEvery { preferencesRepository.current() } returns basePreferences
            coJustRun { preferencesRepository.updateOnboarding(any(), any(), any()) }
            coJustRun { preferencesRepository.updateNotification(any(), any()) }
            coJustRun {
                preferencesRepository.updateSession(
                    any(),
                    any(),
                    any(),
                    any(),
                    any(),
                    any(),
                    any(),
                    any(),
                    any(),
                )
            }
            coEvery { sessionRepository.registerFromPreferences() } returnsMany
                listOf(
                    AppResult.Error(AppException.NetworkException("Session could not be refreshed.")),
                    AppResult.Success(profile),
                )

            val viewModel =
                OnboardingViewModel(
                    preferencesRepository = preferencesRepository,
                    sessionRepository = sessionRepository,
                    stringsProvider = stringsProvider,
                )
            viewModel.selectSign(ZodiacSign.ARIES)

            var completed = false

            viewModel.complete { completed = true }
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.error).isEqualTo("Session could not be refreshed.")
            assertThat(completed).isFalse()

            viewModel.retryLastSubmission { completed = true }
            advanceUntilIdle()

            assertThat(completed).isTrue()
            assertThat(viewModel.uiState.value.error).isNull()
            assertThat(viewModel.uiState.value.isSubmitting).isFalse()
        }
}
