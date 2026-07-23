package com.parsfilo.astrology.feature.monthly

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import com.parsfilo.astrology.core.ads.AdEligibilityChecker
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.ContentRepository
import com.parsfilo.astrology.core.data.repository.RemoteConfigRepository
import com.parsfilo.astrology.core.domain.model.MonthlyHoroscope
import com.parsfilo.astrology.core.ui.MviViewModel
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.TimeUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

data class MonthlyUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val monthly: MonthlyHoroscope? = null,
    val error: String? = null,
    val showBannerAd: Boolean = false,
)

sealed interface MonthlyUiEvent {
    data object Refresh : MonthlyUiEvent
}

@HiltViewModel
class MonthlyViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val contentRepository: ContentRepository,
        private val preferencesRepository: UserPreferencesRepository,
        private val analyticsRepository: AnalyticsRepository,
        private val remoteConfigRepository: RemoteConfigRepository,
        private val adEligibilityChecker: AdEligibilityChecker,
    ) : MviViewModel<MonthlyUiState, MonthlyUiEvent, Unit>(MonthlyUiState()) {
        private val signFromArgs: String? = savedStateHandle.get<String>("sign")

        init {
            viewModelScope.launch { load(false) }
        }

        override fun onEvent(event: MonthlyUiEvent) {
            if (event == MonthlyUiEvent.Refresh) {
                viewModelScope.launch { load(true) }
            }
        }

        private suspend fun load(forceRefresh: Boolean) {
            val sign = signFromArgs ?: preferencesRepository.current().selectedSign
            val prefs = preferencesRepository.current()
            val flags = remoteConfigRepository.fetchFlags()
            val canShowBannerAd = flags.showBannerAds && adEligibilityChecker.canShowBannerAds()
            setState {
                copy(
                    isLoading = !forceRefresh && state.value.monthly == null,
                    isRefreshing = forceRefresh,
                    error = null,
                )
            }
            analyticsRepository.track(AnalyticsEvents.MONTHLY_VIEWED, mapOf("sign" to sign))
            when (val result = contentRepository.getMonthly(sign, prefs.language, TimeUtils.monthIdentifier(), forceRefresh)) {
                is AppResult.Success ->
                    setState {
                        copy(
                            isLoading = false,
                            isRefreshing = false,
                            monthly = result.data,
                            showBannerAd = canShowBannerAd,
                        )
                    }
                is AppResult.Error ->
                    setState {
                        copy(
                            isLoading = false,
                            isRefreshing = false,
                            showBannerAd = canShowBannerAd,
                            error = result.exception.message,
                        )
                    }
                AppResult.Loading -> Unit
            }
        }
    }
