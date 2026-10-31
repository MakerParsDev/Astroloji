package com.parsfilo.astrology.core.ads

import androidx.lifecycle.SavedStateHandle
import com.parsfilo.astrology.core.data.repository.ContentRepository
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean

internal data class RewardClaimCallbacks(
    val onPending: (String) -> Unit,
    val onGranted: suspend () -> Unit,
    val onFailed: (message: String?, expired: Boolean) -> Unit,
)

/**
 * Enforces a single SSV verification attempt and keeps an earned challenge
 * across a screen re-creation. An unverified claim never grants content.
 */
internal class RewardClaimVerifier(
    private val repository: ContentRepository,
    private val savedState: SavedStateHandle,
    private val scope: CoroutineScope,
) {
    private val claiming = AtomicBoolean(false)
    private var grantedChallengeId: String? = null

    fun claim(
        challengeId: String,
        pendingId: String?,
        callbacks: RewardClaimCallbacks,
    ) {
        if (challengeId == grantedChallengeId || !claiming.compareAndSet(false, true)) return
        // Never replace an earned but unverified challenge with a different one.
        if (pendingId?.let { it != challengeId } == true) {
            claiming.set(false)
            return
        }
        savedState["pendingRewardChallengeId"] = challengeId
        callbacks.onPending(challengeId)
        scope.launch {
            try {
                when (val result = repository.claimRewardUnlock(challengeId)) {
                    is AppResult.Success -> {
                        grantedChallengeId = challengeId
                        savedState.remove<String>("pendingRewardChallengeId")
                        callbacks.onGranted()
                    }
                    is AppResult.Error -> {
                        val expired = result.exception is AppException.RewardChallengeExpiredException
                        if (expired) savedState.remove<String>("pendingRewardChallengeId")
                        callbacks.onFailed(result.exception.message, expired)
                    }
                    AppResult.Loading -> Unit
                }
            } finally {
                claiming.set(false)
            }
        }
    }
}
