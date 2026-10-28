package com.parsfilo.astrology.core.data.repository

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.local.CompatibilityDao
import com.parsfilo.astrology.core.data.local.DailyDao
import com.parsfilo.astrology.core.data.local.MonthlyDao
import com.parsfilo.astrology.core.data.local.PersonalityDao
import com.parsfilo.astrology.core.data.local.WeeklyDao
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.RewardChallengeResponse
import com.parsfilo.astrology.core.data.remote.RewardClaimResponse
import com.parsfilo.astrology.core.data.session.AuthenticatedRequestExecutor
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.DispatchersProvider
import com.parsfilo.astrology.core.util.StringsProvider
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.Test
import retrofit2.Response
import java.io.IOException
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class ContentRepositoryRewardNetworkTest {
    private fun challenge(): RewardChallengeResponse =
        RewardChallengeResponse(
            challengeId = "challenge-1",
            customData = "challenge-1",
            userId = "user-1",
            rewardType = "daily",
            identifier = "2026-10-28",
            expiresAt = Instant.now().plusSeconds(600).toString(),
        )

    private val api = mockk<AstrologyApi>()
    private val dispatcher = UnconfinedTestDispatcher()
    private val repository =
        ContentRepository(
            api = api,
            dailyDao = mockk<DailyDao>(),
            weeklyDao = mockk<WeeklyDao>(),
            monthlyDao = mockk<MonthlyDao>(),
            compatibilityDao = mockk<CompatibilityDao>(),
            personalityDao = mockk<PersonalityDao>(),
            sessionRepository = mockk<SessionRepository>(),
            requestExecutor = AuthenticatedRequestExecutor(),
            dispatchers = DispatchersProvider(main = dispatcher, io = dispatcher, default = dispatcher),
            json = Json,
            stringsProvider = mockk<StringsProvider>(),
        )

    @Test
    fun `valid matching SSV challenge is accepted for requested period`() =
        runTest {
            val response = challenge()
            coEvery { api.prepareReward(any()) } returns Response.success(response)

            val outcome = repository.prepareRewardUnlock("daily", "2026-10-28")

            assertThat(outcome).isInstanceOf(AppResult.Success::class.java)
            val challenge = (outcome as AppResult.Success).data
            assertThat(challenge.customData).isEqualTo("challenge-1")
            assertThat(challenge.challengeId).isEqualTo("challenge-1")
        }

    @Test
    fun `incomplete SSV challenge fails closed before an ad can start`() =
        runTest {
            val original = challenge()
            val variants =
                listOf(
                    original.copy(challengeId = ""),
                    original.copy(customData = " "),
                    original.copy(customData = "wrong-challenge"),
                    original.copy(userId = ""),
                    original.copy(expiresAt = ""),
                    original.copy(expiresAt = "not-an-instant"),
                )
            for (variant in variants) {
                coEvery { api.prepareReward(any()) } returns Response.success(variant)

                val outcome = repository.prepareRewardUnlock("daily", "2026-10-28")

                assertThat(outcome).isInstanceOf(AppResult.Error::class.java)
                assertThat((outcome as AppResult.Error).exception.message)
                    .contains("invalid")
            }
        }

    @Test
    fun `expired or nearly expired challenge is rejected before ad playback`() =
        runTest {
            val original = challenge()
            val expiryValues =
                listOf(
                    Instant.now().minusSeconds(1).toString(),
                    Instant.now().plusSeconds(15).toString(),
                )
            for (expiry in expiryValues) {
                coEvery { api.prepareReward(any()) } returns Response.success(original.copy(expiresAt = expiry))

                val outcome = repository.prepareRewardUnlock("daily", "2026-10-28")

                assertThat(outcome).isInstanceOf(AppResult.Error::class.java)
            }
        }

    @Test
    fun `wrong reward type or period is rejected rather than shown`() =
        runTest {
            val original = challenge()
            for (variant in listOf(original.copy(rewardType = "weekly"), original.copy(identifier = "2026-10-27"))) {
                coEvery { api.prepareReward(any()) } returns Response.success(variant)

                val outcome = repository.prepareRewardUnlock("daily", "2026-10-28")

                assertThat(outcome).isInstanceOf(AppResult.Error::class.java)
            }
        }

    @Test
    fun `offline reward preparation returns a network error instead of throwing`() =
        runTest {
            coEvery { api.prepareReward(any()) } throws IOException("network down")

            val outcome = repository.prepareRewardUnlock("daily", "2026-10-27")

            assertThat(outcome).isInstanceOf(AppResult.Error::class.java)
            val error = (outcome as AppResult.Error).exception
            assertThat(error).isInstanceOf(AppException.NetworkException::class.java)
            assertThat(error.cause).isInstanceOf(IOException::class.java)
        }

    @Test
    fun `success HTTP code without matching verified reward body never claims`() =
        runTest {
            val valid =
                RewardClaimResponse(
                    ok = true,
                    challengeId = "test-challenge",
                    rewardType = "daily",
                    identifier = "2026-10-28",
                    entitlementExpiresAt = Instant.now().plusSeconds(3600).toString(),
                )
            val malformed =
                listOf(
                    Response.success(valid.copy(ok = false)),
                    Response.success(valid.copy(challengeId = "different-challenge")),
                    Response.success<RewardClaimResponse>(null),
                )
            for (response in malformed) {
                coEvery { api.claimReward(any()) } returns response

                val outcome = repository.claimRewardUnlock("test-challenge")

                assertThat(outcome).isInstanceOf(AppResult.Error::class.java)
            }
        }

    @Test
    fun `lost reward verification response never grants local entitlement`() =
        runTest {
            coEvery { api.claimReward(any()) } throws IOException("connection reset")

            val outcome = repository.claimRewardUnlock("test-challenge")

            assertThat(outcome).isInstanceOf(AppResult.Error::class.java)
            val error = (outcome as AppResult.Error).exception
            assertThat(error).isInstanceOf(AppException.NetworkException::class.java)
            assertThat(error.message).contains("temporarily unavailable")
        }

    @Test
    fun `cancellation propagates and is not mislabeled as a network error`() =
        runTest {
            coEvery { api.prepareReward(any()) } throws CancellationException("view closed")

            var cancellation: CancellationException? = null
            try {
                repository.prepareRewardUnlock("weekly", "2026-W44")
            } catch (e: CancellationException) {
                cancellation = e
            }
            assertThat(cancellation?.message).isEqualTo("view closed")
        }
}
