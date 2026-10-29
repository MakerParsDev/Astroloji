package com.parsfilo.astrology.feature.daily

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import com.parsfilo.astrology.core.ads.AdEligibilityChecker
import com.parsfilo.astrology.core.ads.prepareEligibleRewardChallenge
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.ContentRepository
import com.parsfilo.astrology.core.data.repository.RemoteConfigRepository
import com.parsfilo.astrology.core.domain.model.DailyHoroscope
import com.parsfilo.astrology.core.domain.model.RewardChallenge
import com.parsfilo.astrology.core.ui.MviViewModel
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.TimeUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean
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
    val pendingRewardChallengeId: String? = null,
    val feedback: DailyFeedback? = null,
)

sealed interface DailyUiEvent {
    data object Refresh : DailyUiEvent

    data object UnlockWithReward : DailyUiEvent

    data object RetryRewardVerification : DailyUiEvent

    data class RewardAdUnavailable(
        val message: String,
    ) : DailyUiEvent

    data class RewardEarned(
        val challengeId: String,
    ) : DailyUiEvent

    data class SubmitFeedback(
        val feedback: DailyFeedback,
    ) : DailyUiEvent

    data object ShareClicked : DailyUiEvent
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
        private val savedStateHandle: SavedStateHandle,
        private val contentRepository: ContentRepository,
        private val preferencesRepository: UserPreferencesRepository,
        private val analyticsRepository: AnalyticsRepository,
        private val remoteConfigRepository: RemoteConfigRepository,
        private val adEligibilityChecker: AdEligibilityChecker,
    ) : MviViewModel<DailyUiState, DailyUiEvent, DailyUiEffect>(
            DailyUiState(pendingRewardChallengeId = savedStateHandle["pendingRewardChallengeId"]),
        ) {
        private val signFromArgs: String? = savedStateHandle.get<String>("sign")

        // Claim preparation is a network call; repeated taps must not mint
        // multiple outstanding SSV challenges for a single user action.
        private val preparingReward = AtomicBoolean(false)
        private val claimingReward = AtomicBoolean(false)
        private var claimedChallengeId: String? = null

        init {
            viewModelScope.launch {
                load(signFromArgs ?: preferencesRepository.current().selectedSign, false)
            }
        }

        override fun onEvent(event: DailyUiEvent) {
            when (event) {
                DailyUiEvent.Refresh -> refresh()
                DailyUiEvent.UnlockWithReward -> prepareRewardUnlock()
                DailyUiEvent.RetryRewardVerification -> {
                    state.value.pendingRewardChallengeId?.let(::claimRewardUnlock)
                }
                is DailyUiEvent.RewardAdUnavailable -> setState { copy(error = event.message) }
                is DailyUiEvent.RewardEarned -> claimRewardUnlock(event.challengeId)
                is DailyUiEvent.SubmitFeedback -> submitFeedback(event.feedback)
                DailyUiEvent.ShareClicked -> trackShareClicked()
            }
        }

        private fun refresh() {
            viewModelScope.launch {
                load(signFromArgs ?: preferencesRepository.current().selectedSign, true)
            }
        }

        private fun prepareRewardUnlock() {
            // If an SDK reward was already earned, verify it instead of
            // asking the user to watch a second ad for the same content.
            state.value.pendingRewardChallengeId?.let {
                claimRewardUnlock(it)
                return
            }
            if (!preparingReward.compareAndSet(false, true)) return
            viewModelScope.launch {
                try {
                    setState { copy(error = null) }
                    val result =
                        prepareEligibleRewardChallenge(
                            repository = contentRepository,
                            eligibility = adEligibilityChecker,
                            rewardType = "daily",
                            identifier = TimeUtils.dateIdentifier(),
                        )
                    when (result) {
                        is AppResult.Success -> sendEffect { DailyUiEffect.ShowRewardAd(result.data) }
                        is AppResult.Error -> setState { copy(error = result.exception.message) }
                        AppResult.Loading -> Unit
                        null -> setState { copy(canUnlockWithReward = false) }
                    }
                } finally {
                    preparingReward.set(false)
                }
            }
        }

        private fun claimRewardUnlock(challengeId: String) {
            if (challengeId == claimedChallengeId || !claimingReward.compareAndSet(false, true)) return
            // Do not replace an earned, unverified challenge with a different one.
            if (state.value.pendingRewardChallengeId?.let { it != challengeId } == true) {
                claimingReward.set(false)
                return
            }
            savedStateHandle["pendingRewardChallengeId"] = challengeId
            setState { copy(pendingRewardChallengeId = challengeId, error = null) }
            viewModelScope.launch {
                try {
                    when (val result = contentRepository.claimRewardUnlock(challengeId)) {
                        is AppResult.Success -> {
                            claimedChallengeId = challengeId
                            savedStateHandle.remove<String>("pendingRewardChallengeId")
                            setState { copy(pendingRewardChallengeId = null) }
                            load(signFromArgs ?: preferencesRepository.current().selectedSign, true)
                        }
                        is AppResult.Error -> {
                            if (result.exception is AppException.RewardChallengeExpiredException) {
                                savedStateHandle.remove<String>("pendingRewardChallengeId")
                                setState { copy(pendingRewardChallengeId = null) }
                            }
                            setState { copy(error = result.exception.message) }
                        }
                        AppResult.Loading -> Unit
                    }
                } finally {
                    claimingReward.set(false)
                }
            }
        }

        private fun trackShareClicked() {
            val sign = state.value.horoscope?.sign ?: signFromArgs ?: return
            viewModelScope.launch {
                analyticsRepository.track(
                    AnalyticsEvents.SHARE_CLICKED,
                    mapOf(
                        "source" to "daily",
                        "sign" to sign,
                        "format" to "image_link",
                    ),
                )
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
                preferencesRepository.updateDailyFeedback(horoscope.date, horoscope.sign, feedback.analyticsValue)
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
                            .takeIf {
                                prefs.lastDailyFeedbackDate == result.data.date &&
                                    prefs.lastDailyFeedbackSign == result.data.sign
                            }
                    val retainedFeedback =
                        state.value.feedback.takeIf {
                            state.value.horoscope?.date == result.data.date &&
                                state.value.horoscope?.sign == result.data.sign
                        }
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
