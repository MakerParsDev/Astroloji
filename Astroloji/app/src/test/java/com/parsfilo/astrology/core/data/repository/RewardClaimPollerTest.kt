package com.parsfilo.astrology.core.data.repository

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class RewardClaimPollerTest {
    @Test
    fun `retries pending verification and succeeds within the bound`() =
        runTest {
            val attempts =
                ArrayDeque(
                    listOf(
                        RewardClaimAttempt(409, "PENDING_VERIFICATION"),
                        RewardClaimAttempt(409, "PENDING_VERIFICATION"),
                        RewardClaimAttempt(200, null, verifiedSuccessBody = true),
                    ),
                )
            val delays = mutableListOf<Long>()

            val outcome =
                pollRewardClaim(
                    maxAttempts = 5,
                    delayMillis = 750,
                    delayFn = { delays.add(it) },
                ) { attempts.removeFirst() }

            assertThat(outcome).isEqualTo(RewardClaimPollOutcome.CLAIMED)
            assertThat(delays).containsExactly(750L, 750L)
        }

    @Test
    fun `stops after bounded pending verification attempts`() =
        runTest {
            var calls = 0

            val outcome =
                pollRewardClaim(
                    maxAttempts = 3,
                    delayMillis = 500,
                    delayFn = {},
                ) {
                    calls += 1
                    RewardClaimAttempt(409, "PENDING_VERIFICATION")
                }

            assertThat(outcome).isEqualTo(RewardClaimPollOutcome.TIMED_OUT)
            assertThat(calls).isEqualTo(3)
        }

    @Test
    fun `HTTP 200 without verified claim response does not grant success`() =
        runTest {
            val outcome =
                pollRewardClaim(maxAttempts = 3, delayMillis = 1, delayFn = {}) {
                    RewardClaimAttempt(200, null, verifiedSuccessBody = false)
                }
            assertThat(outcome).isEqualTo(RewardClaimPollOutcome.FAILED)
        }

    @Test
    fun `terminal expired and missing challenges permit safe fresh preparation`() =
        runTest {
            val terminalResponses =
                listOf(
                    RewardClaimAttempt(410, "REWARD_CHALLENGE_EXPIRED"),
                    RewardClaimAttempt(410, "REWARD_ENTITLEMENT_EXPIRED"),
                    RewardClaimAttempt(404, "REWARD_CHALLENGE_NOT_FOUND"),
                )
            for (attempt in terminalResponses) {
                var calls = 0
                val outcome =
                    pollRewardClaim(maxAttempts = 3, delayMillis = 1, delayFn = {}) {
                        calls++
                        attempt
                    }
                assertThat(outcome).isEqualTo(RewardClaimPollOutcome.EXPIRED)
                assertThat(calls).isEqualTo(1)
            }

            assertThat(
                pollRewardClaim(maxAttempts = 3, delayMillis = 1, delayFn = {}) {
                    RewardClaimAttempt(404, "OTHER_NOT_FOUND")
                },
            ).isEqualTo(RewardClaimPollOutcome.FAILED)
        }

    @Test
    fun `does not retry unauthorized or permanent failures`() =
        runTest {
            assertThat(
                pollRewardClaim(maxAttempts = 3, delayMillis = 1, delayFn = {}) {
                    RewardClaimAttempt(401, null)
                },
            ).isEqualTo(RewardClaimPollOutcome.UNAUTHORIZED)

            assertThat(
                pollRewardClaim(maxAttempts = 3, delayMillis = 1, delayFn = {}) {
                    RewardClaimAttempt(409, "TRANSACTION_REPLAY")
                },
            ).isEqualTo(RewardClaimPollOutcome.FAILED)
        }
}
