package com.parsfilo.astrology.feature.weekly

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import com.parsfilo.astrology.core.ads.AdEligibilityChecker
import com.parsfilo.astrology.core.ads.prepareEligibleRewardChallenge
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.ContentRepository
import com.parsfilo.astrology.core.data.repository.RemoteConfigRepository
import com.parsfilo.astrology.core.domain.model.RewardChallenge
import com.parsfilo.astrology.core.domain.model.WeeklyHoroscope
import com.parsfilo.astrology.core.ui.MviViewModel
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.TimeUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject

data class WeeklyUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val weekly: WeeklyHoroscope? = null,
    val error: String? = null,
    val showBannerAd: Boolean = false,
    val canUnlockWithReward: Boolean = false,
    val pendingRewardChallengeId: String? = null,
)

sealed interface WeeklyUiEvent {
    data object Refresh : WeeklyUiEvent

    data object UnlockWithReward : WeeklyUiEvent

    data object RetryRewardVerification : WeeklyUiEvent

    data class RewardAdUnavailable(
        val message: String,
    ) : WeeklyUiEvent

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
        private val savedStateHandle: SavedStateHandle,
        private val contentRepository: ContentRepository,
        private val preferencesRepository: UserPreferencesRepository,
        private val analyticsRepository: AnalyticsRepository,
        private val remoteConfigRepository: RemoteConfigRepository,
        private val adEligibilityChecker: AdEligibilityChecker,
    ) : MviViewModel<WeeklyUiState, WeeklyUiEvent, WeeklyUiEffect>(
            WeeklyUiState(pendingRewardChallengeId = savedStateHandle["pendingRewardChallengeId"]),
        ) {
        private val signFromArgs: String? = savedStateHandle.get<String>("sign")
        private val preparingReward = AtomicBoolean(false)
        private val claimingReward = AtomicBoolean(false)
        private var claimedChallengeId: String? = null

        init {
            viewModelScope.launch { load(false) }
        }

        override fun onEvent(event: WeeklyUiEvent) {
            when (event) {
                WeeklyUiEvent.Refresh -> {
                    viewModelScope.launch { load(true) }
                }
                WeeklyUiEvent.UnlockWithReward -> prepareRewardUnlock()
                WeeklyUiEvent.RetryRewardVerification -> {
                    state.value.pendingRewardChallengeId?.let(::claimRewardUnlock)
                }
                is WeeklyUiEvent.RewardAdUnavailable -> {
                    setState { copy(error = event.message) }
                }
                is WeeklyUiEvent.RewardEarned -> claimRewardUnlock(event.challengeId)
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
                            rewardType = "weekly",
                            identifier = TimeUtils.weekIdentifier(),
                        )
                    when (result) {
                        is AppResult.Success -> sendEffect { WeeklyUiEffect.ShowRewardAd(result.data) }
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
                            load(true)
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
