package com.parsfilo.astrology.core.data.repository

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.local.CompatibilityDao
import com.parsfilo.astrology.core.data.local.DailyDao
import com.parsfilo.astrology.core.data.local.MonthlyDao
import com.parsfilo.astrology.core.data.local.PersonalityDao
import com.parsfilo.astrology.core.data.local.WeeklyDao
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.CompatibilityResponse
import com.parsfilo.astrology.core.data.session.AuthenticatedRequestExecutor
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.DispatchersProvider
import com.parsfilo.astrology.core.util.StringsProvider
import io.mockk.coEvery
import io.mockk.coJustRun
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class ContentRepositoryCompatibilityTest {
    private val api = mockk<AstrologyApi>()
    private val dailyDao = mockk<DailyDao>()
    private val weeklyDao = mockk<WeeklyDao>()
    private val monthlyDao = mockk<MonthlyDao>()
    private val compatibilityDao = mockk<CompatibilityDao>()
    private val personalityDao = mockk<PersonalityDao>()
    private val sessionRepository = mockk<SessionRepository>()
    private val stringsProvider = mockk<StringsProvider>()
    private val dispatcher = UnconfinedTestDispatcher()
    private val repository =
        ContentRepository(
            api = api,
            dailyDao = dailyDao,
            weeklyDao = weeklyDao,
            monthlyDao = monthlyDao,
            compatibilityDao = compatibilityDao,
            personalityDao = personalityDao,
            sessionRepository = sessionRepository,
            requestExecutor = AuthenticatedRequestExecutor(),
            dispatchers = DispatchersProvider(main = dispatcher, io = dispatcher, default = dispatcher),
            json = Json,
            stringsProvider = stringsProvider,
        )

    private fun response(loveScore: Int?): CompatibilityResponse =
        CompatibilityResponse(
            sign1 = "aries",
            sign2 = "leo",
            language = "tr",
            overallScore = 70,
            loveScore = loveScore,
            friendshipScore = loveScore,
            workScore = loveScore,
            summary = "Test summary",
        )

    @Test
    fun `a free-tier response with no sub-scores is not cached, so a stale 0 percent can never be read back`() =
        runTest {
            coEvery { compatibilityDao.get("aries", "leo", "tr") } returns null
            coEvery { api.getCompatibility("aries", "leo", "tr") } returns Response.success(response(loveScore = null))

            val result = repository.getCompatibility("aries", "leo", "tr")

            assertThat(result).isInstanceOf(AppResult.Success::class.java)
            assertThat((result as AppResult.Success).data.loveScore).isNull()
            coVerify(exactly = 0) { compatibilityDao.upsert(any()) }
        }

    @Test
    fun `a full premium response with real sub-scores is cached normally`() =
        runTest {
            coEvery { compatibilityDao.get("aries", "leo", "tr") } returns null
            coEvery { api.getCompatibility("aries", "leo", "tr") } returns Response.success(response(loveScore = 62))
            coJustRun { compatibilityDao.upsert(any()) }

            val result = repository.getCompatibility("aries", "leo", "tr")

            assertThat(result).isInstanceOf(AppResult.Success::class.java)
            assertThat((result as AppResult.Success).data.loveScore).isEqualTo(62)
            coVerify(exactly = 1) { compatibilityDao.upsert(any()) }
        }
}
