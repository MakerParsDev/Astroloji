package com.parsfilo.astrology.feature.chart

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.ChartRepository
import com.parsfilo.astrology.core.domain.model.GuidanceEvidence
import com.parsfilo.astrology.core.domain.model.GuidanceSignal
import com.parsfilo.astrology.core.domain.model.PersonalGuidance
import com.parsfilo.astrology.core.domain.model.UserPreferences
import com.parsfilo.astrology.core.util.AppResult
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class PersonalGuidanceViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val chartRepository = mockk<ChartRepository>()
    private val preferencesRepository = mockk<UserPreferencesRepository>()
    private val chartClock = mockk<ChartClock>()

    @Test
    fun `selected date requests unknown-time guidance without persisting birth data`() =
        runTest {
            val pickerMillis = Instant.parse("1990-01-15T00:00:00.000Z").toEpochMilli()
            coEvery { preferencesRepository.current() } returns UserPreferences(language = "tr")
            every { chartClock.now() } returns Instant.parse("2026-08-05T11:22:33.987Z")
            coEvery {
                chartRepository.getPersonalGuidance(
                    natalTimestamp = "1990-01-15T12:00:00.000Z",
                    natalTimeCertainty = "unknown",
                    targetTimestamp = "2026-08-05T11:22:33.987Z",
                    language = "tr",
                )
            } returns AppResult.Success(guidance())

            val viewModel = createViewModel()
            viewModel.selectBirthDate(pickerMillis)
            viewModel.loadGuidance()
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.birthDateMillis).isEqualTo(pickerMillis)
            assertThat(
                viewModel.uiState.value.guidance
                    ?.signals,
            ).hasSize(3)
            assertThat(viewModel.uiState.value.isLoading).isFalse()
            coVerify(exactly = 1) { preferencesRepository.current() }
            coVerify(exactly = 1) {
                chartRepository.getPersonalGuidance(
                    natalTimestamp = "1990-01-15T12:00:00.000Z",
                    natalTimeCertainty = "unknown",
                    targetTimestamp = "2026-08-05T11:22:33.987Z",
                    language = "tr",
                )
            }
        }

    @Test
    fun `changing or clearing the date removes stale guidance`() =
        runTest {
            val firstDate = Instant.parse("1990-01-15T00:00:00.000Z").toEpochMilli()
            coEvery { preferencesRepository.current() } returns UserPreferences(language = "en")
            every { chartClock.now() } returns Instant.parse("2026-08-05T11:22:33.987Z")
            coEvery { chartRepository.getPersonalGuidance(any(), any(), any(), any()) } returns
                AppResult.Success(guidance())
            val viewModel = createViewModel()

            viewModel.selectBirthDate(firstDate)
            viewModel.loadGuidance()
            advanceUntilIdle()
            assertThat(viewModel.uiState.value.guidance).isNotNull()

            viewModel.selectBirthDate(firstDate + DAY_MILLIS)
            assertThat(viewModel.uiState.value.guidance).isNull()

            viewModel.loadGuidance()
            advanceUntilIdle()
            assertThat(viewModel.uiState.value.guidance).isNotNull()
            viewModel.clearBirthData()
            assertThat(viewModel.uiState.value.birthDateMillis).isNull()
            assertThat(viewModel.uiState.value.guidance).isNull()
        }

    @Test
    fun `older guidance response cannot overwrite a newer birth date request`() =
        runTest {
            val firstDate = Instant.parse("1990-01-15T00:00:00.000Z").toEpochMilli()
            val secondDate = Instant.parse("1991-02-16T00:00:00.000Z").toEpochMilli()
            val firstResult = CompletableDeferred<AppResult<PersonalGuidance>>()
            val secondResult = CompletableDeferred<AppResult<PersonalGuidance>>()
            val pendingResults = ArrayDeque(listOf(firstResult, secondResult))
            coEvery { preferencesRepository.current() } returns UserPreferences(language = "en")
            every { chartClock.now() } returns Instant.parse("2026-08-05T11:22:33.987Z")
            coEvery { chartRepository.getPersonalGuidance(any(), any(), any(), any()) } coAnswers {
                pendingResults.removeFirst().await()
            }
            val viewModel = createViewModel()

            viewModel.selectBirthDate(firstDate)
            viewModel.loadGuidance()
            runCurrent()
            viewModel.selectBirthDate(secondDate)
            viewModel.loadGuidance()
            runCurrent()

            secondResult.complete(AppResult.Success(guidance("new-")))
            runCurrent()
            firstResult.complete(AppResult.Success(guidance("old-")))
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.birthDateMillis).isEqualTo(secondDate)
            val guidanceId =
                viewModel.uiState.value.guidance
                    ?.signals
                    ?.first()
                    ?.id
            assertThat(guidanceId).isEqualTo("new-one")
            assertThat(viewModel.uiState.value.isLoading).isFalse()
        }

    @Test
    fun `future birth dates are rejected before any network request`() =
        runTest {
            every { chartClock.now() } returns Instant.parse("2026-08-05T11:22:33.987Z")
            val viewModel = createViewModel()

            viewModel.selectBirthDate(Instant.parse("2026-08-06T00:00:00.000Z").toEpochMilli())
            viewModel.loadGuidance()
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.birthDateMillis).isNull()
            assertThat(viewModel.uiState.value.inputError).isEqualTo(ChartInputError.FUTURE_BIRTH_DATE)
            coVerify(exactly = 0) { chartRepository.getPersonalGuidance(any(), any(), any(), any()) }
        }

    private fun createViewModel(): PersonalGuidanceViewModel =
        PersonalGuidanceViewModel(
            chartRepository = chartRepository,
            preferencesRepository = preferencesRepository,
            chartClock = chartClock,
        )

    private fun guidance(prefix: String = ""): PersonalGuidance =
        PersonalGuidance(
            version = "personal-guidance-v1",
            calculationVersion = "guidance-rules-v1",
            generatedAt = "2026-08-05T11:22:34.000Z",
            targetTimestamp = "2026-08-05T11:22:33.987Z",
            language = "tr",
            signals =
                listOf(
                    signal("${prefix}one", 94),
                    signal("${prefix}two", 84),
                    signal("${prefix}three", 82),
                ),
            limitations = listOf("birth_time_uncertain", "moon_position_time_sensitive"),
            disclaimer = "Eğlence ve öz değerlendirme içindir.",
        )

    private fun signal(
        id: String,
        priority: Int,
    ): GuidanceSignal =
        GuidanceSignal(
            id = id,
            priority = priority,
            domain = "growth",
            title = "Kişisel sinyal",
            summary = "Yansıtıcı özet",
            actionPrompt = "Küçük bir adım seç.",
            evidence =
                GuidanceEvidence(
                    transitBody = "neptune",
                    natalBody = "jupiter",
                    aspect = "square",
                    orb = 0.84,
                    maximumOrb = 3.0,
                ),
        )

    private companion object {
        const val DAY_MILLIS = 86_400_000L
    }
}
