package com.parsfilo.astrology.feature.reading

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.remote.DeepReadingResponse
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.ReadingRepository
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
class ReadingViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val readingRepository = mockk<ReadingRepository>()
    private val preferencesRepository = mockk<UserPreferencesRepository>()
    private val analyticsRepository = mockk<AnalyticsRepository>()

    private fun stubDependencies(preferences: UserPreferences = UserPreferences(language = "en")) {
        coEvery { preferencesRepository.current() } returns preferences
        coJustRun { analyticsRepository.track(any(), any()) }
    }

    private fun createViewModel(): ReadingViewModel =
        ReadingViewModel(
            readingRepository = readingRepository,
            preferencesRepository = preferencesRepository,
            analyticsRepository = analyticsRepository,
        )

    @Test
    fun `loads the deep reading on init and tracks the viewed event`() =
        runTest {
            stubDependencies()
            coEvery { readingRepository.getDeepReading("en") } returns
                AppResult.Success(
                    DeepReadingResponse(text = "You carry deep intuition.", cached = false, creditsSpent = 30),
                )

            val viewModel = createViewModel()
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.isLoading).isFalse()
            assertThat(viewModel.uiState.value.text).isEqualTo("You carry deep intuition.")
            coVerify(exactly = 1) {
                analyticsRepository.track(AnalyticsEvents.DEEP_READING_VIEWED, mapOf("cached" to "false"))
            }
            coVerify(exactly = 1) {
                analyticsRepository.track(
                    AnalyticsEvents.CREDIT_SPENT,
                    mapOf("feature" to "deep_reading", "credits" to "30"),
                )
            }
        }

    @Test
    fun `a cached reading does not report credits spent`() =
        runTest {
            stubDependencies()
            coEvery { readingRepository.getDeepReading("en") } returns
                AppResult.Success(
                    DeepReadingResponse(text = "You carry deep intuition.", cached = true, creditsSpent = 0),
                )

            createViewModel()
            advanceUntilIdle()

            coVerify(exactly = 0) { analyticsRepository.track(AnalyticsEvents.CREDIT_SPENT, any()) }
        }

    @Test
    fun `insufficient credits flags the state so the UI can route to the credits screen`() =
        runTest {
            stubDependencies()
            coEvery { readingRepository.getDeepReading("en") } returns
                AppResult.Error(AppException.BillingException("Not enough credits."))

            val viewModel = createViewModel()
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.insufficientCredits).isTrue()
            assertThat(viewModel.uiState.value.error).isEqualTo("Not enough credits.")
        }

    @Test
    fun `retry reloads the reading`() =
        runTest {
            stubDependencies()
            coEvery { readingRepository.getDeepReading("en") } returns
                AppResult.Error(AppException.NetworkException("Network error."))
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(ReadingUiEvent.Retry)
            advanceUntilIdle()

            coVerify(exactly = 2) { readingRepository.getDeepReading("en") }
        }
}
