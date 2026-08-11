package com.parsfilo.astrology.feature.reading

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.ReadingRepository
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.TimeUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ReadingUiState(
    val isLoading: Boolean = true,
    val text: String? = null,
    val error: String? = null,
    val insufficientCredits: Boolean = false,
)

sealed interface ReadingUiEvent {
    data object Retry : ReadingUiEvent
}

@HiltViewModel
class ReadingViewModel
    @Inject
    constructor(
        private val readingRepository: ReadingRepository,
        private val preferencesRepository: UserPreferencesRepository,
        private val analyticsRepository: AnalyticsRepository,
    ) : ViewModel() {
        private val _uiState = MutableStateFlow(ReadingUiState())
        val uiState: StateFlow<ReadingUiState> = _uiState.asStateFlow()

        init {
            load()
        }

        fun onEvent(event: ReadingUiEvent) {
            when (event) {
                ReadingUiEvent.Retry -> load()
            }
        }

        private fun load() {
            viewModelScope.launch {
                _uiState.update { it.copy(isLoading = true, error = null, insufficientCredits = false) }
                val language = TimeUtils.normalizeLanguageTag(preferencesRepository.current().language)
                when (val result = readingRepository.getDeepReading(language)) {
                    is AppResult.Success -> {
                        _uiState.update { it.copy(isLoading = false, text = result.data.text, error = null) }
                        analyticsRepository.track(
                            AnalyticsEvents.DEEP_READING_VIEWED,
                            mapOf("cached" to result.data.cached.toString()),
                        )
                        if (result.data.creditsSpent > 0) {
                            analyticsRepository.track(
                                AnalyticsEvents.CREDIT_SPENT,
                                mapOf("feature" to "deep_reading", "credits" to result.data.creditsSpent.toString()),
                            )
                        }
                    }
                    is AppResult.Error -> {
                        val insufficientCredits = result.exception is AppException.BillingException
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                error = result.exception.message,
                                insufficientCredits = insufficientCredits,
                            )
                        }
                    }
                    AppResult.Loading -> Unit
                }
            }
        }
    }
