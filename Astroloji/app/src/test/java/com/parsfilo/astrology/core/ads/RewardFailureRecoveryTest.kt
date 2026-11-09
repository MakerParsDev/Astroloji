package com.parsfilo.astrology.core.ads

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.repository.ContentRepository
import com.parsfilo.astrology.core.util.AppResult
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RewardFailureRecoveryTest {
    @Test
    fun unexpectedPrepareExceptionIsRetryableAndNeverShowsAnAd() =
        runTest {
            val repository = mockk<ContentRepository>()
            val eligibility = mockk<AdEligibilityChecker>()
            coEvery { eligibility.canShowRewarded() } returns true
            coEvery { repository.prepareRewardUnlock("daily", "2026-11-07") } throws
                IllegalArgumentException("synthetic invalid response")

            val result = prepareEligibleRewardChallenge(repository, eligibility, "daily", "2026-11-07")

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat((result as AppResult.Error).exception.message)
                .isEqualTo("Reward preparation is temporarily unavailable.")
        }

    @Test
    fun canceledPreparationIsNotMisreportedAsARecoverableError() =
        runTest {
            val repository = mockk<ContentRepository>()
            val eligibility = mockk<AdEligibilityChecker>()
            coEvery { eligibility.canShowRewarded() } returns true
            coEvery { repository.prepareRewardUnlock("weekly", "2026-W45") } throws
                CancellationException("synthetic cancellation")

            val result =
                runCatching {
                    prepareEligibleRewardChallenge(repository, eligibility, "weekly", "2026-W45")
                }

            assertThat(result.exceptionOrNull()).isInstanceOf(CancellationException::class.java)
        }

    @Test
    fun unexpectedClaimExceptionKeepsEarnedChallengeForSafeRetry() =
        runTest {
            val repository = mockk<ContentRepository>()
            val state = SavedStateHandle()
            val verifier = RewardClaimVerifier(repository, state, this)
            val events = mutableListOf<String>()
            coEvery { repository.claimRewardUnlock("earned-challenge") } throws
                IllegalStateException("synthetic response decoding failure")
            val callbacks =
                RewardClaimCallbacks(
                    onPending = { events += "pending" },
                    onGranted = { events += "granted" },
                    onFailed = { message, expired ->
                        assertThat(expired).isFalse()
                        events += "failed:$message"
                    },
                )

            verifier.claim("earned-challenge", null, callbacks)
            advanceUntilIdle()

            assertThat(state.get<String>("pendingRewardChallengeId")).isEqualTo("earned-challenge")
            assertThat(events)
                .containsExactly(
                    "pending",
                    "failed:Reward verification is temporarily unavailable.",
                ).inOrder()

            coEvery { repository.claimRewardUnlock("earned-challenge") } returns AppResult.Success(Unit)
            verifier.claim("earned-challenge", state["pendingRewardChallengeId"], callbacks)
            advanceUntilIdle()

            assertThat(state.get<String>("pendingRewardChallengeId")).isNull()
            assertThat(events.last()).isEqualTo("granted")
            coVerify(exactly = 2) { repository.claimRewardUnlock("earned-challenge") }
        }

    @Test
    fun unexpectedPrepareRuntimeFailureNeverStartsAdAndReturnsRetryableError() =
        runTest {
            val repository = mockk<ContentRepository>()
            val eligibility = mockk<AdEligibilityChecker>()
            coEvery { eligibility.canShowRewarded() } returns true
            coEvery { repository.prepareRewardUnlock("daily", "2026-11-09") } throws
                RuntimeException("synthetic provider error - do not expose")

            val result = prepareEligibleRewardChallenge(repository, eligibility, "daily", "2026-11-09")

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat((result as AppResult.Error).exception.message)
                .isEqualTo("Reward preparation is temporarily unavailable.")
        }

    @Test
    fun unexpectedClaimRuntimeFailureKeepsEarnedChallengeRetryable() =
        runTest {
            val repository = mockk<ContentRepository>()
            val state = SavedStateHandle()
            val verifier = RewardClaimVerifier(repository, state, this)
            val events = mutableListOf<String>()
            coEvery { repository.claimRewardUnlock("earned-challenge") } throws
                RuntimeException("synthetic provider error - do not expose")
            val callbacks =
                RewardClaimCallbacks(
                    onPending = { events += "pending" },
                    onGranted = { events += "granted" },
                    onFailed = { message, expired ->
                        assertThat(expired).isFalse()
                        events += "failed:$message"
                    },
                )

            verifier.claim("earned-challenge", null, callbacks)
            advanceUntilIdle()
            assertThat(state.get<String>("pendingRewardChallengeId")).isEqualTo("earned-challenge")
            assertThat(events)
                .containsExactly("pending", "failed:Reward verification is temporarily unavailable.")
                .inOrder()
            coEvery { repository.claimRewardUnlock("earned-challenge") } returns AppResult.Success(Unit)
            verifier.claim("earned-challenge", state["pendingRewardChallengeId"], callbacks)
            advanceUntilIdle()
            assertThat(events.last()).isEqualTo("granted")
            assertThat(state.get<String>("pendingRewardChallengeId")).isNull()
        }

    @Test
    fun canceledClaimDoesNotGrantOrReportUnexpectedFailure() =
        runTest {
            val repository = mockk<ContentRepository>()
            val state = SavedStateHandle()
            val verifier = RewardClaimVerifier(repository, state, this)
            coEvery { repository.claimRewardUnlock("earned-challenge") } throws
                CancellationException("synthetic cancellation")
            var granted = false
            var failed = false

            verifier.claim(
                "earned-challenge",
                null,
                RewardClaimCallbacks(
                    onPending = {},
                    onGranted = { granted = true },
                    onFailed = { _, _ -> failed = true },
                ),
            )
            advanceUntilIdle()

            assertThat(granted).isFalse()
            assertThat(failed).isFalse()
            assertThat(state.get<String>("pendingRewardChallengeId")).isEqualTo("earned-challenge")
        }
}
