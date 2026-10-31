package com.parsfilo.astrology.core.ads

import com.parsfilo.astrology.core.data.repository.ContentRepository
import com.parsfilo.astrology.core.domain.model.RewardChallenge
import com.parsfilo.astrology.core.util.AppResult

/**
 * Rechecks ads eligibility after the network request because consent may
 * change before a challenge is returned. Null means the ad is not eligible.
 */
internal suspend fun prepareEligibleRewardChallenge(
    repository: ContentRepository,
    eligibility: AdEligibilityChecker,
    rewardType: String,
    identifier: String,
): AppResult<RewardChallenge>? {
    if (!eligibility.canShowRewarded()) return null
    val result = repository.prepareRewardUnlock(rewardType, identifier)
    return if (result is AppResult.Success && !eligibility.canShowRewarded()) null else result
}
