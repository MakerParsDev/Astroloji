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
import com.parsfilo.astrology.core.domain.model.RewardChallenge
import com.parsfilo.astrology.core.ui.MviViewModel
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.TimeUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class DailyFeedback(
    val analyticsValue: String,
) {
    RESONATED("resonated"),
    PARTLY("partly"),
    NOT_TODAY("not_today"),
    ;

    companion object {
        fun fromAnalyticsValue(value: String?): DailyFeedback? = entries.firstOrNull { it.analyticsValue == value }
    }
}

data class DailyUiState(
    val isLoading: Boolean = true,
    val horoscope: DailyHoroscope? = null,
    val error: String? = null,
    val isRefreshing: Boolean = false,
    val showBannerAd: Boolean = false,
    val canUnlockWithReward: Boolean = false,
    val feedback: DailyFeedback? = null,
)

sealed interface DailyUiEvent {
    data object Refresh : DailyUiEvent

    data object UnlockWithReward : DailyUiEvent

    data class RewardAdUnavailable(
        val message: String,
    ) : DailyUiEvent

    data class RewardEarned(
        val challengeId: String,
    ) : DailyUiEvent

    data class SubmitFeedback(
        val feedback: DailyFeedback,
    ) : DailyUiEvent
}

sealed interface DailyUiEffect {
    data class ShowRewardAd(
        val challenge: RewardChallenge,
    ) : DailyUiEffect
}

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
                        when (val prepareResult = contentRepository.prepareRewardUnlock("daily", identifier)) {
                            is AppResult.Success -> sendEffect { DailyUiEffect.ShowRewardAd(prepareResult.data) }
                            is AppResult.Error -> setState { copy(error = prepareResult.exception.message) }
                            AppResult.Loading -> Unit
                        }
                    }
                }
                is DailyUiEvent.RewardAdUnavailable -> {
                    setState { copy(error = event.message) }
                }
                is DailyUiEvent.RewardEarned -> {
                    viewModelScope.launch {
                        when (val claimResult = contentRepository.claimRewardUnlock(event.challengeId)) {
                            is AppResult.Success -> load(signFromArgs ?: preferencesRepository.current().selectedSign, true)
                            is AppResult.Error -> setState { copy(error = claimResult.exception.message) }
                            AppResult.Loading -> Unit
                        }
                    }
                }
                is DailyUiEvent.SubmitFeedback -> submitFeedback(event.feedback)
            }
        }

        private fun submitFeedback(feedback: DailyFeedback) {
            if (state.value.feedback != null) return
            val horoscope = state.value.horoscope ?: return
            setState { copy(feedback = feedback) }
            viewModelScope.launch {
                analyticsRepository.track(
                    AnalyticsEvents.DAILY_FEEDBACK_SUBMITTED,
                    mapOf(
                        "source" to "daily",
                        "result" to feedback.analyticsValue,
                        "sign" to horoscope.sign,
                    ),
                )
                preferencesRepository.updateDailyFeedback(horoscope.date, feedback.analyticsValue)
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
                is AppResult.Success -> {
                    val persistedFeedback =
                        DailyFeedback
                            .fromAnalyticsValue(prefs.lastDailyFeedbackValue)
                            .takeIf { prefs.lastDailyFeedbackDate == result.data.date }
                    val retainedFeedback =
                        state.value.feedback.takeIf { state.value.horoscope?.date == result.data.date }
                            ?: persistedFeedback
                    setState {
                        copy(
                            isLoading = false,
                            isRefreshing = false,
                            horoscope = result.data,
                            showBannerAd = canShowBannerAd,
                            canUnlockWithReward = result.data.full == null && canShowRewarded,
                            feedback = retainedFeedback,
                        )
                    }
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
