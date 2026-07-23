package com.parsfilo.astrology.feature.daily

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import com.parsfilo.astrology.core.ads.AdEligibilityChecker
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.ContentRepository
import com.parsfilo.astrology.core.data.repository.RemoteConfigRepository
import com.parsfilo.astrology.core.domain.model.DailyHoroscope
import com.parsfilo.astrology.core.ui.MviViewModel
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.TimeUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DailyUiState(
    val isLoading: Boolean = true,
    val horoscope: DailyHoroscope? = null,
    val error: String? = null,
    val isRefreshing: Boolean = false,
    val showBannerAd: Boolean = false,
    val canUnlockWithReward: Boolean = false,
)

sealed interface DailyUiEvent {
    data object Refresh : DailyUiEvent

    data object UnlockWithReward : DailyUiEvent
}

sealed interface DailyUiEffect

@HiltViewModel
class DailyViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val contentRepository: ContentRepository,
        private val preferencesRepository: UserPreferencesRepository,
        private val analyticsRepository: AnalyticsRepository,
        private val remoteConfigRepository: RemoteConfigRepository,
        private val adEligibilityChecker: AdEligibilityChecker,
    ) : MviViewModel<DailyUiState, DailyUiEvent, DailyUiEffect>(DailyUiState()) {
        private val signFromArgs: String? = savedStateHandle.get<String>("sign")

        init {
            viewModelScope.launch {
                load(signFromArgs ?: preferencesRepository.current().selectedSign, false)
            }
        }

        override fun onEvent(event: DailyUiEvent) {
            when (event) {
                DailyUiEvent.Refresh -> {
                    viewModelScope.launch {
                        load(signFromArgs ?: preferencesRepository.current().selectedSign, true)
                    }
                }
                DailyUiEvent.UnlockWithReward -> {
                    viewModelScope.launch {
                        val identifier = TimeUtils.dateIdentifier()
                        when (val claimResult = contentRepository.claimRewardUnlock("daily", identifier)) {
                            is AppResult.Success -> load(signFromArgs ?: preferencesRepository.current().selectedSign, true)
                            is AppResult.Error -> setState { copy(error = claimResult.exception.message) }
                            AppResult.Loading -> Unit
                        }
                    }
                }
            }
        }

        private suspend fun load(
            sign: String,
            refresh: Boolean,
        ) {
            setState { copy(isLoading = !refresh, isRefreshing = refresh, error = null) }
            val prefs = preferencesRepository.current()
            val flags = remoteConfigRepository.fetchFlags()
            val canShowBannerAd = flags.showBannerAds && adEligibilityChecker.canShowBannerAds()
            val canShowRewarded = flags.rewardedDailyUnlockLimit > 0 && adEligibilityChecker.canShowRewarded()
            analyticsRepository.track(AnalyticsEvents.DAILY_VIEWED, mapOf("sign" to sign))
            when (
                val result =
                    contentRepository.getDaily(
                        sign = sign,
                        language = prefs.language,
                        date = TimeUtils.dateIdentifier(),
                        forceRefresh = refresh,
                    )
            ) {
                is AppResult.Success ->
                    setState {
                        copy(
                            isLoading = false,
                            isRefreshing = false,
                            horoscope = result.data,
                            showBannerAd = canShowBannerAd,
                            canUnlockWithReward = result.data.full == null && canShowRewarded,
                        )
                    }
                is AppResult.Error ->
                    setState {
                        copy(
                            isLoading = false,
                            isRefreshing = false,
                            showBannerAd = canShowBannerAd,
                            canUnlockWithReward = false,
                            error = result.exception.message,
                        )
                    }
                AppResult.Loading -> Unit
            }
        }
    }
