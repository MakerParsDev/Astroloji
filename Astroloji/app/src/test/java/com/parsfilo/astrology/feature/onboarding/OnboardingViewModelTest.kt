package com.parsfilo.astrology.feature.onboarding

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.SessionRepository
import com.parsfilo.astrology.core.domain.model.UserPreferences
import com.parsfilo.astrology.core.domain.model.UserProfile
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.StringsProvider
import com.parsfilo.astrology.core.util.ZodiacSign
import io.mockk.coEvery
import io.mockk.coJustRun
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class OnboardingViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val preferencesRepository = mockk<UserPreferencesRepository>()
    private val analyticsRepository = mockk<AnalyticsRepository>()
    private val sessionRepository = mockk<SessionRepository>()
    private val stringsProvider = mockk<StringsProvider>()

    @Test
    fun `complete surfaces a validation error when no sign is selected`() =
        runTest {
            coEvery { stringsProvider.get(any()) } returns "Lutfen burcunuzu secin"
            coJustRun { analyticsRepository.track(any(), any()) }
            coJustRun { analyticsRepository.enqueue(any(), any()) }

            val viewModel = createViewModel()

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
            coJustRun { analyticsRepository.track(any(), any()) }
            coJustRun { analyticsRepository.enqueue(any(), any()) }
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

            val viewModel = createViewModel()
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

    @Test
    fun `initialization and step changes emit bounded onboarding funnel events`() =
        runTest {
            coJustRun { analyticsRepository.track(any(), any()) }

            val viewModel = createViewModel()

            viewModel.trackStep(OnboardingStep.BIRTH_PROFILE)
            viewModel.trackStep(OnboardingStep.NOTIFICATION_VALUE)
            viewModel.recordNotificationPermission(granted = true)
            advanceUntilIdle()

            coVerify(exactly = 1) {
                analyticsRepository.track(AnalyticsEvents.ONBOARDING_STARTED, emptyMap())
            }
            coVerify(exactly = 1) {
                analyticsRepository.track(
                    AnalyticsEvents.ONBOARDING_STEP_VIEWED,
                    mapOf("step" to "birth_profile"),
                )
            }
            coVerify(exactly = 1) {
                analyticsRepository.track(
                    AnalyticsEvents.ONBOARDING_STEP_VIEWED,
                    mapOf("step" to "notification_value"),
                )
            }
            coVerify(exactly = 1) {
                analyticsRepository.track(
                    AnalyticsEvents.NOTIFICATION_PERMISSION_RESULT,
                    mapOf("result" to "granted"),
                )
            }
        }

    @Test
    fun `successful registration emits onboarding completed once`() =
        runTest {
            val preferences =
                UserPreferences(
                    onboardingCompleted = false,
                    selectedSign = ZodiacSign.ARIES.key,
                    language = "en",
                    jwt = "jwt",
                    userId = "user-1",
                    isPremium = false,
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
            stubSuccessfulRegistration(preferences, profile)
            coJustRun { analyticsRepository.track(any(), any()) }

            val viewModel = createViewModel()
            viewModel.setLanguage("en")
            viewModel.selectSign(ZodiacSign.ARIES)
            viewModel.complete {}
            advanceUntilIdle()

            coVerify(exactly = 1) {
                analyticsRepository.enqueue(
                    AnalyticsEvents.ONBOARDING_COMPLETED,
                    mapOf("sign" to "aries", "locale" to "en"),
                )
            }
        }

    @Test
    fun `onboarding completion is queued before successful navigation`() =
        runTest {
            val preferences =
                UserPreferences(
                    onboardingCompleted = false,
                    selectedSign = ZodiacSign.ARIES.key,
                    language = "tr",
                    jwt = "jwt",
                    userId = "user-1",
                    isPremium = false,
                )
            val profile =
                UserProfile(
                    userId = "user-1",
                    sign = ZodiacSign.ARIES.key,
                    language = "tr",
                    isPremium = false,
                    premiumExpiresAt = null,
                    jwt = "jwt",
                    utcOffset = 3,
                    notificationEnabled = true,
                    notificationHour = 9,
                )
            val queueGate = CompletableDeferred<Unit>()
            stubSuccessfulRegistration(preferences, profile)
            coJustRun {
                analyticsRepository.track(
                    AnalyticsEvents.ONBOARDING_STARTED,
                    any(),
                )
            }
            coEvery {
                analyticsRepository.enqueue(
                    AnalyticsEvents.ONBOARDING_COMPLETED,
                    any(),
                )
            } coAnswers { queueGate.await() }

            val viewModel = createViewModel()
            viewModel.selectSign(ZodiacSign.ARIES)
            var completed = false

            viewModel.complete { completed = true }
            runCurrent()

            assertThat(completed).isFalse()
            assertThat(viewModel.uiState.value.isSubmitting).isTrue()
            queueGate.complete(Unit)
            advanceUntilIdle()
            assertThat(completed).isTrue()
            assertThat(viewModel.uiState.value.isSubmitting).isFalse()
        }

    private fun createViewModel(): OnboardingViewModel =
        OnboardingViewModel(
            preferencesRepository = preferencesRepository,
            sessionRepository = sessionRepository,
            stringsProvider = stringsProvider,
            analyticsRepository = analyticsRepository,
        )

    private fun stubSuccessfulRegistration(
        preferences: UserPreferences,
        profile: UserProfile,
    ) {
        coEvery { preferencesRepository.current() } returns preferences
        coJustRun { analyticsRepository.enqueue(any(), any()) }
        coJustRun { preferencesRepository.updateLanguage(any()) }
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
        coEvery { sessionRepository.registerFromPreferences() } returns AppResult.Success(profile)
    }
}
