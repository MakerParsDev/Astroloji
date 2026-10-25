package com.parsfilo.astrology.core.data.repository

import android.database.sqlite.SQLiteException
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.local.QueuedEventDao
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.MoodInsight
import com.parsfilo.astrology.core.data.remote.MoodInsightResponse
import com.parsfilo.astrology.core.data.remote.MoodLogResponse
import com.parsfilo.astrology.core.data.session.AuthenticatedRequestExecutor
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.DispatchersProvider
import io.mockk.coEvery
import io.mockk.coJustRun
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class MoodRepositoryTest {
    private val api = mockk<AstrologyApi>()
    private val sessionRepository = mockk<SessionRepository>()
    private val queuedEventDao = mockk<QueuedEventDao>()
    private val dispatcher = UnconfinedTestDispatcher()
    private val repository =
        MoodRepository(
            api = api,
            sessionRepository = sessionRepository,
            queuedEventDao = queuedEventDao,
            requestExecutor = AuthenticatedRequestExecutor(),
            dispatchers =
                DispatchersProvider(
                    main = dispatcher,
                    io = dispatcher,
                    default = dispatcher,
                ),
        )

    @Test
    fun `logging a mood returns the stored entry`() =
        runTest {
            coEvery { api.logMood(any()) } returns
                Response.success(MoodLogResponse(date = "2026-08-11", mood = "good", domain = "growth"))

            val result = repository.logMood("good", "growth")

            assertThat(result).isInstanceOf(AppResult.Success::class.java)
            assertThat((result as AppResult.Success).data.mood).isEqualTo("good")
        }

    @Test
    fun `insight lookup unwraps a found correlation`() =
        runTest {
            coEvery { api.getMoodInsight() } returns
                Response.success(MoodInsightResponse(insight = MoodInsight("communication", 4, 3)))

            val result = repository.getInsight()

            assertThat(result).isInstanceOf(AppResult.Success::class.java)
            assertThat((result as AppResult.Success).data.insight).isEqualTo(MoodInsight("communication", 4, 3))
        }

    @Test
    fun `mood history deletion succeeds on authorized HTTP success`() =
        runTest {
            coEvery { api.deleteMoodHistory() } returns Response.success(Unit)
            coJustRun { queuedEventDao.deleteByType(AnalyticsEvents.MOOD_LOGGED) }

            val result = repository.deleteMoodHistory()

            assertThat(result).isInstanceOf(AppResult.Success::class.java)
            coVerify(exactly = 1) { queuedEventDao.deleteByType(AnalyticsEvents.MOOD_LOGGED) }
        }

    @Test
    fun `failed local queue cleanup reports retryable deletion instead of success`() =
        runTest {
            coEvery { api.deleteMoodHistory() } returns Response.success(Unit)
            coEvery { queuedEventDao.deleteByType(AnalyticsEvents.MOOD_LOGGED) } throws
                SQLiteException("synthetic SQLite failure")

            val result = repository.deleteMoodHistory()

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
        }

    @Test
    fun `mood history deletion reports failure and does not claim data removed`() =
        runTest {
            coEvery { api.deleteMoodHistory() } returns Response.error(503, "offline".toResponseBody())

            val result = repository.deleteMoodHistory()

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            coVerify(exactly = 0) { queuedEventDao.deleteByType(any()) }
        }

    @Test
    fun `unauthorized responses surface as an unauthorized error`() =
        runTest {
            coEvery { api.logMood(any()) } returns Response.error(401, "unauthorized".toResponseBody())
            coEvery { sessionRepository.refreshAfterUnauthorized(null) } returns
                AppResult.Error(AppException.UnauthorizedException())

            val result = repository.logMood("stressed", null)

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat((result as AppResult.Error).exception)
                .isInstanceOf(AppException.UnauthorizedException::class.java)
        }
}
