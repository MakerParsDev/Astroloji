package com.parsfilo.astrology.feature.chart

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.ChartRepository
import com.parsfilo.astrology.core.domain.model.PersonalGuidance
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.TimeUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ChartClock
    @Inject
    constructor() {
        fun now(): Instant = Instant.now()
    }

enum class ChartInputError {
    FUTURE_BIRTH_DATE,
}

data class PersonalGuidanceUiState(
    val birthDateMillis: Long? = null,
    val isLoading: Boolean = false,
    val guidance: PersonalGuidance? = null,
    val inputError: ChartInputError? = null,
    val error: String? = null,
)

@HiltViewModel
class PersonalGuidanceViewModel
    @Inject
    constructor(
        private val chartRepository: ChartRepository,
        private val preferencesRepository: UserPreferencesRepository,
        private val chartClock: ChartClock,
    ) : ViewModel() {
        private val _uiState = MutableStateFlow(PersonalGuidanceUiState())
        val uiState: StateFlow<PersonalGuidanceUiState> = _uiState.asStateFlow()

        fun selectBirthDate(millis: Long) {
            val selectedDate = datePickerMillisToLocalDate(millis)
            val today = chartClock.now().atZone(java.time.ZoneOffset.UTC).toLocalDate()
            if (selectedDate.isAfter(today)) {
                _uiState.update {
                    it.copy(
                        birthDateMillis = null,
                        guidance = null,
                        inputError = ChartInputError.FUTURE_BIRTH_DATE,
                        error = null,
                    )
                }
                return
            }
            _uiState.update {
                it.copy(
                    birthDateMillis = millis,
                    guidance = null,
                    inputError = null,
                    error = null,
                )
            }
        }

        fun clearBirthData() {
            _uiState.value = PersonalGuidanceUiState()
        }

        fun loadGuidance() {
            val birthDateMillis = _uiState.value.birthDateMillis ?: return
            if (_uiState.value.isLoading) return

            viewModelScope.launch {
                _uiState.update { it.copy(isLoading = true, guidance = null, error = null) }
                val language = TimeUtils.normalizeLanguageTag(preferencesRepository.current().language)
                val result =
                    chartRepository.getPersonalGuidance(
                        natalTimestamp = unknownBirthTimestamp(datePickerMillisToLocalDate(birthDateMillis)),
                        natalTimeCertainty = UNKNOWN_TIME_CERTAINTY,
                        targetTimestamp = targetTimestamp(chartClock.now()),
                        language = language,
                    )
                when (result) {
                    is AppResult.Success ->
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                guidance = result.data,
                                error = null,
                            )
                        }
                    is AppResult.Error ->
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                guidance = null,
                                error = result.exception.message,
                            )
                        }
                    AppResult.Loading -> Unit
                }
            }
        }

        private companion object {
            const val UNKNOWN_TIME_CERTAINTY = "unknown"
        }
    }
