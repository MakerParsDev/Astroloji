package com.parsfilo.astrology.feature.compatibility

import androidx.lifecycle.viewModelScope
import com.parsfilo.astrology.core.ads.AdEligibilityChecker
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.ContentRepository
import com.parsfilo.astrology.core.data.repository.FavoritesRepository
import com.parsfilo.astrology.core.data.repository.RemoteConfigRepository
import com.parsfilo.astrology.core.domain.model.CompatibilityReport
import com.parsfilo.astrology.core.ui.MviViewModel
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.ZodiacSign
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

data class CompatibilityUiState(
    val isLoading: Boolean = false,
    val mySign: String = ZodiacSign.ARIES.key,
    val selectedSign: String = ZodiacSign.LEO.key,
    val favorites: Set<String> = emptySet(),
    val report: CompatibilityReport? = null,
    val showBannerAd: Boolean = false,
    val error: String? = null,
)

sealed interface CompatibilityUiEvent {
    data class SelectSign(
        val sign: String,
    ) : CompatibilityUiEvent

    data object Load : CompatibilityUiEvent

    data object ToggleFavorite : CompatibilityUiEvent
}

@HiltViewModel
class CompatibilityViewModel
    @Inject
    constructor(
        private val preferencesRepository: UserPreferencesRepository,
        private val contentRepository: ContentRepository,
        private val analyticsRepository: AnalyticsRepository,
        private val favoritesRepository: FavoritesRepository,
        private val remoteConfigRepository: RemoteConfigRepository,
        private val adEligibilityChecker: AdEligibilityChecker,
    ) : MviViewModel<CompatibilityUiState, CompatibilityUiEvent, Unit>(CompatibilityUiState()) {
        init {
            viewModelScope.launch {
                val prefs = preferencesRepository.current()
                val favorites = favoritesRepository.getFavorites().toSet()
                setState {
                    copy(
                        mySign = prefs.selectedSign,
                        favorites = favorites,
                    )
                }
                onEvent(CompatibilityUiEvent.Load)
            }
        }

        override fun onEvent(event: CompatibilityUiEvent) {
            when (event) {
                is CompatibilityUiEvent.SelectSign -> {
                    setState { copy(selectedSign = event.sign) }
                    onEvent(CompatibilityUiEvent.Load)
                }
                CompatibilityUiEvent.ToggleFavorite -> {
                    viewModelScope.launch {
                        favoritesRepository.toggle(state.value.selectedSign)
                        val favorites = favoritesRepository.getFavorites().toSet()
                        setState { copy(favorites = favorites) }
                    }
                }
                CompatibilityUiEvent.Load -> {
                    viewModelScope.launch {
                        val prefs = preferencesRepository.current()
                        val flags = remoteConfigRepository.fetchFlags()
                        val canShowBannerAd = flags.showBannerAds && adEligibilityChecker.canShowBannerAds()
                        setState { copy(isLoading = true, error = null) }
                        analyticsRepository.track(
                            AnalyticsEvents.COMPAT_CHECKED,
                            mapOf("sign1" to state.value.mySign, "sign2" to state.value.selectedSign),
                        )
                        when (
                            val result =
                                contentRepository.getCompatibility(
                                    state.value.mySign,
                                    state.value.selectedSign,
                                    prefs.language,
                                )
                        ) {
                            is AppResult.Success ->
                                setState {
                                    copy(
                                        isLoading = false,
                                        report = result.data,
                                        showBannerAd = canShowBannerAd,
                                    )
                                }
                            is AppResult.Error ->
                                setState {
                                    copy(
                                        isLoading = false,
                                        showBannerAd = canShowBannerAd,
                                        error = result.exception.message,
                                    )
                                }
                            AppResult.Loading -> Unit
                        }
                    }
                }
            }
        }
    }
