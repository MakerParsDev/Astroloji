package com.parsfilo.astrology.feature.home

import androidx.lifecycle.viewModelScope
import com.parsfilo.astrology.core.ads.GoogleMobileAdsConsentManager
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.ContentRepository
import com.parsfilo.astrology.core.data.repository.FavoritesRepository
import com.parsfilo.astrology.core.data.repository.RemoteConfigRepository
import com.parsfilo.astrology.core.data.repository.SessionRepository
import com.parsfilo.astrology.core.domain.model.DailyHoroscope
import com.parsfilo.astrology.core.domain.model.UserProfile
import com.parsfilo.astrology.core.domain.model.WeeklyHoroscope
import com.parsfilo.astrology.core.ui.MviViewModel
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.StreakTracker
import com.parsfilo.astrology.core.util.TimeUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HomeUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val profile: UserProfile? = null,
    val daily: DailyHoroscope? = null,
    val weekly: WeeklyHoroscope? = null,
    val favorites: List<String> = emptyList(),
    val streakCount: Int = 0,
    val achievedMilestone: Int? = null,
    val showBannerAd: Boolean = false,
    val error: String? = null,
)

sealed interface HomeUiEvent {
    data object Refresh : HomeUiEvent

    data class ToggleFavorite(
        val sign: String,
    ) : HomeUiEvent
}

sealed interface HomeUiEffect

@HiltViewModel
class HomeViewModel
    @Inject
    constructor(
        private val sessionRepository: SessionRepository,
        private val contentRepository: ContentRepository,
        private val favoritesRepository: FavoritesRepository,
        private val preferencesRepository: UserPreferencesRepository,
        private val analyticsRepository: AnalyticsRepository,
        private val remoteConfigRepository: RemoteConfigRepository,
        private val consentManager: GoogleMobileAdsConsentManager,
    ) : MviViewModel<HomeUiState, HomeUiEvent, HomeUiEffect>(HomeUiState()) {
        init {
            refresh(false)
        }

        override fun onEvent(event: HomeUiEvent) {
            when (event) {
                HomeUiEvent.Refresh -> refresh(true)
                is HomeUiEvent.ToggleFavorite -> {
                    viewModelScope.launch {
                        favoritesRepository.toggle(event.sign)
                        val favorites = favoritesRepository.getFavorites()
                        setState { copy(favorites = favorites) }
                    }
                }
            }
        }

        private fun refresh(force: Boolean) {
            viewModelScope.launch {
                setState {
                    copy(
                        isLoading = !force && state.value.daily == null && state.value.weekly == null,
                        isRefreshing = force,
                        error = null,
                    )
                }
                val flags = remoteConfigRepository.fetchFlags()
                val profile = (sessionRepository.loadProfile() as? AppResult.Success)?.data
                val preferences = preferencesRepository.current()
                val sign = profile?.sign ?: preferences.selectedSign
                val language = preferences.language
                val streak =
                    StreakTracker.update(
                        previousDate = preferences.lastStreakDate,
                        previousCount = preferences.streakCount,
                        utcOffset = profile?.utcOffset ?: preferences.utcOffset,
                    )
                preferencesRepository.updateStreak(streak.lastDate, streak.count)
                analyticsRepository.track(AnalyticsEvents.APP_OPEN, mapOf("sign" to sign))
                val (dailyResult, weeklyResult) =
                    coroutineScope {
                        val dailyDeferred =
                            async {
                                contentRepository.getDaily(
                                    sign = sign,
                                    language = language,
                                    date = TimeUtils.dateIdentifier(),
                                    forceRefresh = force,
                                )
                            }
                        val weeklyDeferred =
                            async {
                                contentRepository.getWeekly(
                                    sign = sign,
                                    language = language,
                                    week = TimeUtils.weekIdentifier(),
                                    forceRefresh = force,
                                )
                            }
                        dailyDeferred.await() to weeklyDeferred.await()
                    }
                val favorites = favoritesRepository.getFavorites()
                setState {
                    copy(
                        isLoading = false,
                        isRefreshing = false,
                        profile = profile,
                        daily = (dailyResult as? AppResult.Success)?.data,
                        weekly = (weeklyResult as? AppResult.Success)?.data,
                        favorites = favorites,
                        streakCount = streak.count,
                        achievedMilestone = streak.achievedMilestone,
                        showBannerAd =
                            !((profile?.isPremium ?: preferences.isPremium)) &&
                                flags.showBannerAds &&
                                consentManager.canRequestAds,
                        error =
                            (dailyResult as? AppResult.Error)?.exception?.message
                                ?: (weeklyResult as? AppResult.Error)?.exception?.message,
                    )
                }
            }
        }
    }
