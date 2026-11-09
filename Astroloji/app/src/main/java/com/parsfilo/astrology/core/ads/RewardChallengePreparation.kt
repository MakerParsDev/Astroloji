package com.parsfilo.astrology.core.ads

import com.parsfilo.astrology.core.data.repository.ContentRepository
import com.parsfilo.astrology.core.domain.model.RewardChallenge
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import kotlinx.coroutines.CancellationException

/**
 * Rechecks ads eligibility after the network request because consent may
 * change before a challenge is returned. Null means the ad is not eligible.
 */
@Suppress("TooGenericExceptionCaught")
internal suspend fun prepareEligibleRewardChallenge(
    repository: ContentRepository,
    eligibility: AdEligibilityChecker,
    rewardType: String,
    identifier: String,
): AppResult<RewardChallenge>? {
    if (!eligibility.canShowRewarded()) return null
    val result =
        try {
            repository.prepareRewardUnlock(rewardType, identifier)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // A failed SDK/converter/network dependency must never start an unverified ad.
            // Preserve cancellation semantics; no raw upstream message reaches the user.
            AppResult.Error(AppException.NetworkException("Reward preparation is temporarily unavailable.", e))
        }
    return if (result is AppResult.Success && !eligibility.canShowRewarded()) null else result
}
