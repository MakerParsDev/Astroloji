package com.parsfilo.astrology.core.data.repository

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.local.CompatibilityDao
import com.parsfilo.astrology.core.data.local.DailyDao
import com.parsfilo.astrology.core.data.local.MonthlyDao
import com.parsfilo.astrology.core.data.local.PersonalityDao
import com.parsfilo.astrology.core.data.local.WeeklyDao
import com.parsfilo.astrology.core.data.remote.AstrologyApi
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
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class ContentRepositoryRewardNetworkTest {
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
