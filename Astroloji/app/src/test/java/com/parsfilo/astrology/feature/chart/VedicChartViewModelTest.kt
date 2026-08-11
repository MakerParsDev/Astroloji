package com.parsfilo.astrology.feature.chart

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.ChartRepository
import com.parsfilo.astrology.core.domain.model.Mahadasha
import com.parsfilo.astrology.core.domain.model.MoonNakshatra
import com.parsfilo.astrology.core.domain.model.SiderealPosition
import com.parsfilo.astrology.core.domain.model.UserPreferences
import com.parsfilo.astrology.core.domain.model.VedicChart
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class VedicChartViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val chartRepository = mockk<ChartRepository>()
    private val preferencesRepository = mockk<UserPreferencesRepository>()

    private fun stubDependencies(preferences: UserPreferences = UserPreferences(language = "en")) {
        coEvery { preferencesRepository.current() } returns preferences
    }

    private fun createViewModel(): VedicChartViewModel =
        VedicChartViewModel(
            chartRepository = chartRepository,
            preferencesRepository = preferencesRepository,
        )

    private fun sampleChart(): VedicChart =
        VedicChart(
            version = "vedic-chart-v1",
            calculationVersion = "astronomy-engine-2.1.19-true-chitrapaksha",
            timeCertainty = "exact",
            ayanamsa = 23.7,
            positions =
                listOf(
                    SiderealPosition(body = "moon", longitude = 143.8, signKey = "leo", degreeInSign = 23.8),
                ),
            moonNakshatra = MoonNakshatra(nakshatra = "purva_phalguni", index = 10, pada = 4),
            mahadashas =
                listOf(
                    Mahadasha(
                        graha = "venus",
                        startDate = "1990-01-15T12:00:00.000Z",
                        endDate = "1994-05-07T15:42:14.844Z",
                        years = 4.3,
                    ),
                ),
            limitations = emptyList(),
        )

    @Test
    fun `loads the vedic chart on init using the current app language`() =
        runTest {
            stubDependencies(UserPreferences(language = "tr"))
            coEvery { chartRepository.getVedicChart() } returns AppResult.Success(sampleChart())

            val viewModel = createViewModel()
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.isLoading).isFalse()
            assertThat(viewModel.uiState.value.chart).isEqualTo(sampleChart())
            assertThat(viewModel.uiState.value.language).isEqualTo("tr")
            assertThat(viewModel.uiState.value.error).isNull()
            coVerify(exactly = 1) { chartRepository.getVedicChart() }
        }

    @Test
    fun `surfaces the birth-data-required error message when saved birth data is missing`() =
        runTest {
            stubDependencies()
            coEvery { chartRepository.getVedicChart() } returns
                AppResult.Error(AppException.NetworkException("Birth data is required for this feature."))

            val viewModel = createViewModel()
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.isLoading).isFalse()
            assertThat(viewModel.uiState.value.chart).isNull()
            assertThat(viewModel.uiState.value.error).isEqualTo("Birth data is required for this feature.")
        }

    @Test
    fun `retry reloads the chart`() =
        runTest {
            stubDependencies()
            coEvery { chartRepository.getVedicChart() } returns
                AppResult.Error(AppException.NetworkException("Network error."))
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(VedicChartUiEvent.Retry)
            advanceUntilIdle()

            coVerify(exactly = 2) { chartRepository.getVedicChart() }
        }
}
