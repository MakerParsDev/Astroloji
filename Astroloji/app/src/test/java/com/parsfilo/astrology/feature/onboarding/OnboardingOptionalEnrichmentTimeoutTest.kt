package com.parsfilo.astrology.feature.onboarding

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.remote.BirthDataResponse
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
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class OnboardingOptionalEnrichmentTimeoutTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val preferences = mockk<UserPreferencesRepository>()
    private val analytics = mockk<AnalyticsRepository>()
    private val session = mockk<SessionRepository>()
    private val birthData = mockk<BirthDataRepository>()
    private val chart = mockk<ChartRepository>()
    private val strings = mockk<StringsProvider>()

    @Test
    fun stalledOptionalBirthSaveMustNotBlockCompletedOnboarding() =
        runTest {
            val stalled = CompletableDeferred<Unit>()
            coEvery { birthData.saveBirthData(any(), any(), any(), any()) } coAnswers {
                stalled.await()
                AppResult.Success(BirthDataResponse(timeCertainty = "unknown", hasBirthData = true))
            }
            val vm = preparedViewModel()
            var navigationCount = 0

            try {
                vm.complete { navigationCount++ }
                runCurrent()
                assertThat(vm.uiState.value.isSubmitting).isTrue()
                advanceTimeBy(5_000L)
                runCurrent()
                assertThat(navigationCount).isEqualTo(1)
                assertThat(vm.uiState.value.isSubmitting).isFalse()
                assertThat(vm.uiState.value.error).isNull()
            } finally {
                stalled.complete(Unit)
                advanceUntilIdle()
            }
        }

    @Test
    fun stalledOptionalChartMustNotBlockCompletedOnboarding() =
        runTest {
            coEvery { birthData.saveBirthData(any(), any(), any(), any()) } returns
                AppResult.Success(BirthDataResponse(timeCertainty = "exact", hasBirthData = true))
            val stalled = CompletableDeferred<Unit>()
            coEvery { chart.getNatalChart(any(), any(), any(), any()) } coAnswers {
                stalled.await()
                AppResult.Error(AppException.NetworkException("Synthetic chart unavailable"))
            }
            val vm = preparedViewModel()
            vm.setBirthTimeKnown(true)
            vm.setBirthTime(9, 0)
            var navigationCount = 0

            try {
                vm.complete { navigationCount++ }
                runCurrent()
                coVerify(exactly = 1) { chart.getNatalChart(any(), any(), any(), any()) }
                assertThat(vm.uiState.value.isSubmitting).isTrue()
                advanceTimeBy(5_000L)
                runCurrent()
                assertThat(navigationCount).isEqualTo(1)
                assertThat(vm.uiState.value.chartReveal).isNull()
                assertThat(vm.uiState.value.isSubmitting).isFalse()
            } finally {
                stalled.complete(Unit)
                advanceUntilIdle()
            }
        }

    private fun preparedViewModel(): OnboardingViewModel {
        val p =
            UserPreferences(
                onboardingCompleted = false,
                selectedSign = ZodiacSign.ARIES.key,
                language = "en",
                userId = "test-user",
                jwt = "test-jwt",
            )
        coEvery { preferences.current() } returns p
        coJustRun { preferences.updateOnboarding(any(), any(), any()) }
        coJustRun { preferences.updateNotification(any(), any()) }
        coJustRun {
            preferences.updateSession(any(), any(), any(), any(), any(), any(), any(), any(), any())
        }
        coJustRun { analytics.track(any(), any()) }
        coJustRun { analytics.enqueue(any(), any()) }
        coEvery { session.registerFromPreferences() } returns
            AppResult.Success(
                UserProfile(
                    userId = p.userId.orEmpty(),
                    sign = p.selectedSign,
                    language = p.language,
                    isPremium = false,
                    premiumExpiresAt = null,
                    jwt = p.jwt.orEmpty(),
                    utcOffset = 3,
                    notificationEnabled = false,
                    notificationHour = 9,
                ),
            )
        return OnboardingViewModel(
            preferencesRepository = preferences,
            sessionRepository = session,
            birthDataRepository = birthData,
            chartRepository = chart,
            stringsProvider = strings,
            analyticsRepository = analytics,
        ).also {
            it.selectSign(ZodiacSign.ARIES)
            it.selectBirthDate(0L)
            it.selectCity(CitySuggestion("test-city", "Example", "Test", 37.0, -121.0, "UTC"))
        }
    }
}
