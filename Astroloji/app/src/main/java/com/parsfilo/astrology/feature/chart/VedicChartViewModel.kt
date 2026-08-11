package com.parsfilo.astrology.feature.chart

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.ChartRepository
import com.parsfilo.astrology.core.domain.model.VedicChart
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.TimeUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class VedicChartUiState(
    val isLoading: Boolean = true,
    val chart: VedicChart? = null,
    val language: String = "en",
    val error: String? = null,
)

sealed interface VedicChartUiEvent {
    data object Retry : VedicChartUiEvent
}

@HiltViewModel
class VedicChartViewModel
    @Inject
    constructor(
        private val chartRepository: ChartRepository,
        private val preferencesRepository: UserPreferencesRepository,
    ) : ViewModel() {
        private val _uiState = MutableStateFlow(VedicChartUiState())
        val uiState: StateFlow<VedicChartUiState> = _uiState.asStateFlow()

        init {
            load()
        }

        fun onEvent(event: VedicChartUiEvent) {
            when (event) {
                VedicChartUiEvent.Retry -> load()
            }
        }

        private fun load() {
            viewModelScope.launch {
                val language = TimeUtils.normalizeLanguageTag(preferencesRepository.current().language)
                _uiState.update { it.copy(isLoading = true, error = null, language = language) }
                when (val result = chartRepository.getVedicChart()) {
                    is AppResult.Success ->
                        _uiState.update {
                            it.copy(isLoading = false, chart = result.data, error = null)
                        }
                    is AppResult.Error ->
                        _uiState.update {
                            it.copy(isLoading = false, chart = null, error = result.exception.message)
                        }
                    AppResult.Loading -> Unit
                }
            }
        }
    }
