package com.parsfilo.astrology.feature.onboarding

import android.database.sqlite.SQLiteException
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.remote.BirthDataResponse
import com.parsfilo.astrology.core.data.repository.ASTRO_ONBOARDING_FAILURE_CATEGORY_PARAM
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.BirthDataRepository
import com.parsfilo.astrology.core.data.repository.ChartRepository
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
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class OnboardingViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val preferencesRepository = mockk<UserPreferencesRepository>()
    private val analyticsRepository = mockk<AnalyticsRepository>()
    private val sessionRepository = mockk<SessionRepository>()
    private val birthDataRepository = mockk<BirthDataRepository>()
    private val chartRepository = mockk<ChartRepository>()
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
            coVerify(exactly = 1) {
                analyticsRepository.enqueue(
                    AnalyticsEvents.ONBOARDING_REGISTRATION_FAILED,
                    mapOf(ASTRO_ONBOARDING_FAILURE_CATEGORY_PARAM to "network"),
                )
            }

            viewModel.retryLastSubmission { completed = true }
            advanceUntilIdle()

            assertThat(completed).isTrue()
            assertThat(viewModel.uiState.value.error).isNull()
            assertThat(viewModel.uiState.value.isSubmitting).isFalse()
            coVerify(exactly = 1) {
                analyticsRepository.enqueue(AnalyticsEvents.ONBOARDING_REGISTRATION_FAILED, any())
            }
        }

    @Test
    fun `local preferences write failure restores retry without starting backend registration`() =
        runTest {
            val preferences =
                UserPreferences(
                    onboardingCompleted = false,
                    selectedSign = ZodiacSign.ARIES.key,
                    language = "en",
                    userId = "user-1",
                    jwt = "jwt",
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
            coEvery { analyticsRepository.track(any(), any()) } returns Unit
            coEvery { stringsProvider.get(any()) } returns "Registration unavailable, please retry."
            coEvery {
                preferencesRepository.updateOnboarding(any(), any(), any())
            } throws IOException("disk unavailable")
            val viewModel = createViewModel()
            viewModel.selectSign(ZodiacSign.ARIES)
            var navigations = 0

            viewModel.complete { navigations++ }
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.isSubmitting).isFalse()
            assertThat(viewModel.uiState.value.error).isEqualTo("Registration unavailable, please retry.")
            assertThat(navigations).isEqualTo(0)
            coVerify(exactly = 0) { sessionRepository.registerFromPreferences() }
            coVerify(exactly = 1) {
                analyticsRepository.enqueue(
                    AnalyticsEvents.ONBOARDING_REGISTRATION_FAILED,
                    mapOf(ASTRO_ONBOARDING_FAILURE_CATEGORY_PARAM to "other"),
                )
            }

            coJustRun { preferencesRepository.updateOnboarding(any(), any(), any()) }
            viewModel.retryLastSubmission { navigations++ }
            advanceUntilIdle()

            assertThat(navigations).isEqualTo(1)
            assertThat(viewModel.uiState.value.isSubmitting).isFalse()
            coVerify(exactly = 1) { sessionRepository.registerFromPreferences() }
            coVerify(exactly = 1) {
                analyticsRepository.enqueue(AnalyticsEvents.ONBOARDING_COMPLETED, any())
            }
        }

    @Test
    fun profileDatabaseFailureLeavesRegistrationScreenRetryable() =
        runTest {
            stubOnboardingRegistrationSuccess()
            coJustRun { analyticsRepository.track(any(), any()) }
            coEvery { stringsProvider.get(any()) } returns "Registration unavailable, please retry."
            coEvery { sessionRepository.registerFromPreferences() } throws
                SQLiteException("Synthetic profile cache write failure")
            val viewModel = createViewModel()
            viewModel.selectSign(ZodiacSign.ARIES)
            var navigations = 0

            viewModel.complete { navigations++ }
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.isSubmitting).isFalse()
            assertThat(viewModel.uiState.value.error).isEqualTo("Registration unavailable, please retry.")
            assertThat(navigations).isEqualTo(0)
            coVerify(exactly = 1) {
                analyticsRepository.enqueue(
                    AnalyticsEvents.ONBOARDING_REGISTRATION_FAILED,
                    mapOf(ASTRO_ONBOARDING_FAILURE_CATEGORY_PARAM to "other"),
                )
            }
        }

    @Test
    fun `post registration preferences failure returns retry instead of trapping onboarding`() =
        runTest {
            stubOnboardingRegistrationSuccess()
            coJustRun { analyticsRepository.track(any(), any()) }
            coEvery { stringsProvider.get(any()) } returns "Registration unavailable, please retry."
            coEvery { preferencesRepository.updateOnboarding(any(), any(), any()) } coAnswers {
                if (firstArg<Boolean>()) throw IOException("DataStore update failed")
            }
            val viewModel = createViewModel()
            viewModel.selectSign(ZodiacSign.ARIES)
            var navigations = 0

            viewModel.complete { navigations++ }
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.isSubmitting).isFalse()
            assertThat(viewModel.uiState.value.error).isEqualTo("Registration unavailable, please retry.")
            assertThat(navigations).isEqualTo(0)
            coVerify(exactly = 0) { analyticsRepository.enqueue(AnalyticsEvents.ONBOARDING_COMPLETED, any()) }
            coVerify(exactly = 0) {
                analyticsRepository.enqueue(AnalyticsEvents.ONBOARDING_REGISTRATION_FAILED, any())
            }

            coJustRun { preferencesRepository.updateOnboarding(any(), any(), any()) }
            viewModel.retryLastSubmission { navigations++ }
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.isSubmitting).isFalse()
            assertThat(viewModel.uiState.value.error).isNull()
            assertThat(navigations).isEqualTo(1)
            coVerify(exactly = 2) { sessionRepository.registerFromPreferences() }
            coVerify(exactly = 1) { analyticsRepository.enqueue(AnalyticsEvents.ONBOARDING_COMPLETED, any()) }
        }

    @Test
    fun `analytics queue failure after successful registration does not block navigation`() =
        runTest {
            stubOnboardingRegistrationSuccess()
            coJustRun { analyticsRepository.track(any(), any()) }
            coEvery {
                analyticsRepository.enqueue(AnalyticsEvents.ONBOARDING_COMPLETED, any())
            } throws IOException("Analytics queue unavailable")
            val viewModel = createViewModel()
            viewModel.selectSign(ZodiacSign.ARIES)
            var navigations = 0

            viewModel.complete { navigations++ }
            advanceUntilIdle()

            assertThat(navigations).isEqualTo(1)
            assertThat(viewModel.uiState.value.isSubmitting).isFalse()
            assertThat(viewModel.uiState.value.error).isNull()
            coVerify(exactly = 1) { sessionRepository.registerFromPreferences() }
            coVerify(exactly = 1) { analyticsRepository.enqueue(AnalyticsEvents.ONBOARDING_COMPLETED, any()) }
            coVerify(exactly = 0) {
                analyticsRepository.enqueue(AnalyticsEvents.ONBOARDING_REGISTRATION_FAILED, any())
            }
        }

    @Test
    fun optionalBirthDataNetworkFailureDoesNotTrapCompletedOnboarding() =
        runTest {
            stubOnboardingRegistrationSuccess()
            coJustRun { analyticsRepository.track(any(), any()) }
            coEvery {
                birthDataRepository.saveBirthData(any(), any(), any(), any())
            } throws IOException("Synthetic optional birth save failure")

            assertOptionalBirthEnrichmentFailureStillNavigates("UTC")
        }

    @Test
    fun invalidOptionalCityTimezoneDoesNotTrapCompletedOnboarding() =
        runTest {
            stubOnboardingRegistrationSuccess()
            coJustRun { analyticsRepository.track(any(), any()) }
            coEvery {
                birthDataRepository.saveBirthData(any(), any(), any(), any())
            } returns AppResult.Success(BirthDataResponse(timeCertainty = "exact", hasBirthData = true))

            assertOptionalBirthEnrichmentFailureStillNavigates("Mars/Phobos")
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
    fun `double tap does not start a second registration before coroutine dispatch`() =
        runTest {
            val preferences =
                UserPreferences(
                    onboardingCompleted = false,
                    selectedSign = ZodiacSign.ARIES.key,
                    language = "en",
                    userId = "user-1",
                    jwt = "jwt",
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
            val registrationGate = CompletableDeferred<Unit>()
            stubSuccessfulRegistration(preferences, profile)
            coJustRun { analyticsRepository.track(any(), any()) }
            coEvery { sessionRepository.registerFromPreferences() } coAnswers {
                registrationGate.await()
                AppResult.Success(profile)
            }
            val viewModel = createViewModel()
            viewModel.selectSign(ZodiacSign.ARIES)
            var navigations = 0

            viewModel.complete { navigations++ }
            // A second tap before runCurrent is precisely the old race window.
            viewModel.complete { navigations++ }
            assertThat(viewModel.uiState.value.isSubmitting).isTrue()
            runCurrent()
            coVerify(exactly = 1) { sessionRepository.registerFromPreferences() }
            registrationGate.complete(Unit)
            advanceUntilIdle()

            assertThat(navigations).isEqualTo(1)
            assertThat(viewModel.uiState.value.isSubmitting).isFalse()
            coVerify(exactly = 1) {
                analyticsRepository.enqueue(AnalyticsEvents.ONBOARDING_COMPLETED, any())
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

    private suspend fun TestScope.assertOptionalBirthEnrichmentFailureStillNavigates(timeZone: String) {
        val viewModel = createViewModel()
        viewModel.selectSign(ZodiacSign.ARIES)
        viewModel.selectBirthDate(0L)
        viewModel.selectCity(CitySuggestion("test-city", "Example", "Test", 37.0, -121.0, timeZone))
        var navigations = 0

        viewModel.complete { navigations++ }
        advanceUntilIdle()

        assertThat(navigations).isEqualTo(1)
        assertThat(viewModel.uiState.value.isSubmitting).isFalse()
        assertThat(viewModel.uiState.value.error).isNull()
        coVerify(exactly = 1) { analyticsRepository.enqueue(AnalyticsEvents.ONBOARDING_COMPLETED, any()) }
    }

    private fun createViewModel(): OnboardingViewModel =
        OnboardingViewModel(
            preferencesRepository = preferencesRepository,
            sessionRepository = sessionRepository,
            birthDataRepository = birthDataRepository,
            chartRepository = chartRepository,
            stringsProvider = stringsProvider,
            analyticsRepository = analyticsRepository,
        )

    private fun stubOnboardingRegistrationSuccess() {
        val preferences =
            UserPreferences(
                onboardingCompleted = false,
                selectedSign = ZodiacSign.ARIES.key,
                language = "tr",
                jwt = "jwt",
                userId = "user-1",
            )
        val profile =
            UserProfile(
                userId = preferences.userId.orEmpty(),
                sign = preferences.selectedSign,
                language = preferences.language,
                isPremium = false,
                premiumExpiresAt = null,
                jwt = preferences.jwt.orEmpty(),
                utcOffset = 3,
                notificationEnabled = true,
                notificationHour = 9,
            )
        stubSuccessfulRegistration(preferences, profile)
    }

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
