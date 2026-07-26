package com.parsfilo.astrology.core.data.repository

import kotlinx.coroutines.delay

internal data class RewardClaimAttempt(
    val statusCode: Int,
    val errorCode: String?,
)

internal enum class RewardClaimPollOutcome {
    CLAIMED,
    UNAUTHORIZED,
    TIMED_OUT,
    FAILED,
}

internal suspend fun pollRewardClaim(
    maxAttempts: Int,
    delayMillis: Long,
    delayFn: suspend (Long) -> Unit = { delay(it) },
    request: suspend () -> RewardClaimAttempt,
): RewardClaimPollOutcome {
    require(maxAttempts > 0)
    var attemptIndex = 0
    var outcome: RewardClaimPollOutcome? = null

    while (attemptIndex < maxAttempts && outcome == null) {
        val attempt = request()
        outcome =
            when {
                attempt.statusCode in HTTP_SUCCESS_MIN..HTTP_SUCCESS_MAX -> RewardClaimPollOutcome.CLAIMED
                attempt.statusCode == HTTP_UNAUTHORIZED -> RewardClaimPollOutcome.UNAUTHORIZED
                attempt.statusCode == HTTP_CONFLICT && attempt.errorCode == PENDING_VERIFICATION -> {
                    attemptIndex += 1
                    if (attemptIndex < maxAttempts) {
                        delayFn(delayMillis)
                        null
                    } else {
                        RewardClaimPollOutcome.TIMED_OUT
                    }
                }
                else -> RewardClaimPollOutcome.FAILED
            }
    }

    return outcome ?: RewardClaimPollOutcome.TIMED_OUT
}

private const val HTTP_SUCCESS_MIN = 200
private const val HTTP_SUCCESS_MAX = 299
private const val HTTP_UNAUTHORIZED = 401
private const val HTTP_CONFLICT = 409
private const val PENDING_VERIFICATION = "PENDING_VERIFICATION"
