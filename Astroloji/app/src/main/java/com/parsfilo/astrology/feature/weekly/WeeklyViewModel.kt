package com.parsfilo.astrology.feature.weekly

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import com.parsfilo.astrology.core.ads.AdEligibilityChecker
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.ContentRepository
import com.parsfilo.astrology.core.data.repository.RemoteConfigRepository
import com.parsfilo.astrology.core.domain.model.RewardChallenge
import com.parsfilo.astrology.core.domain.model.WeeklyHoroscope
import com.parsfilo.astrology.core.ui.MviViewModel
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.TimeUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

data class WeeklyUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val weekly: WeeklyHoroscope? = null,
    val error: String? = null,
    val showBannerAd: Boolean = false,
    val canUnlockWithReward: Boolean = false,
)

sealed interface WeeklyUiEvent {
    data object Refresh : WeeklyUiEvent

    data object UnlockWithReward : WeeklyUiEvent

    data class RewardEarned(
        val challengeId: String,
    ) : WeeklyUiEvent
}

sealed interface WeeklyUiEffect {
    data class ShowRewardAd(
        val challenge: RewardChallenge,
    ) : WeeklyUiEffect
}

@HiltViewModel
class WeeklyViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val contentRepository: ContentRepository,
        private val preferencesRepository: UserPreferencesRepository,
        private val analyticsRepository: AnalyticsRepository,
        private val remoteConfigRepository: RemoteConfigRepository,
        private val adEligibilityChecker: AdEligibilityChecker,
    ) : MviViewModel<WeeklyUiState, WeeklyUiEvent, WeeklyUiEffect>(WeeklyUiState()) {
        private val signFromArgs: String? = savedStateHandle.get<String>("sign")

        init {
            viewModelScope.launch { load(false) }
        }

        override fun onEvent(event: WeeklyUiEvent) {
            when (event) {
                WeeklyUiEvent.Refresh -> {
                    viewModelScope.launch { load(true) }
                }
                WeeklyUiEvent.UnlockWithReward -> {
                    viewModelScope.launch {
                        val identifier = TimeUtils.weekIdentifier()
                        when (val prepareResult = contentRepository.prepareRewardUnlock("weekly", identifier)) {
                            is AppResult.Success -> sendEffect { WeeklyUiEffect.ShowRewardAd(prepareResult.data) }
                            is AppResult.Error -> setState { copy(error = prepareResult.exception.message) }
                            AppResult.Loading -> Unit
                        }
                    }
                }
                is WeeklyUiEvent.RewardEarned -> {
                    viewModelScope.launch {
                        when (val claimResult = contentRepository.claimRewardUnlock(event.challengeId)) {
                            is AppResult.Success -> load(true)
                            is AppResult.Error -> setState { copy(error = claimResult.exception.message) }
                            AppResult.Loading -> Unit
                        }
                    }
                }
            }
        }

        private suspend fun load(forceRefresh: Boolean) {
            val sign = signFromArgs ?: preferencesRepository.current().selectedSign
            val prefs = preferencesRepository.current()
            val flags = remoteConfigRepository.fetchFlags()
            val canShowBannerAd = flags.showBannerAds && adEligibilityChecker.canShowBannerAds()
            val canShowRewarded = flags.rewardedDailyUnlockLimit > 0 && adEligibilityChecker.canShowRewarded()
            setState {
                copy(
                    isLoading = !forceRefresh && state.value.weekly == null,
                    isRefreshing = forceRefresh,
                    error = null,
                )
            }
            analyticsRepository.track(AnalyticsEvents.WEEKLY_VIEWED, mapOf("sign" to sign))
            when (val result = contentRepository.getWeekly(sign, prefs.language, TimeUtils.weekIdentifier(), forceRefresh)) {
                is AppResult.Success ->
                    setState {
                        copy(
                            isLoading = false,
                            isRefreshing = false,
                            weekly = result.data,
                            showBannerAd = canShowBannerAd,
                            canUnlockWithReward = isWeeklyPremiumContentLocked(result.data) && canShowRewarded,
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

internal enum class WeeklyPremiumSection {
    LOVE,
    CAREER,
    MONEY,
}

internal fun firstLockedWeeklyPremiumSection(weekly: WeeklyHoroscope): WeeklyPremiumSection? =
    when {
        weekly.love == null -> WeeklyPremiumSection.LOVE
        weekly.career == null -> WeeklyPremiumSection.CAREER
        weekly.money == null -> WeeklyPremiumSection.MONEY
        else -> null
    }

internal fun isWeeklyPremiumContentLocked(
    weekly: WeeklyHoroscope,
): Boolean = firstLockedWeeklyPremiumSection(weekly) != null
