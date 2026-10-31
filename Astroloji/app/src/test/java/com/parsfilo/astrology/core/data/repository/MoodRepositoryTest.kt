package com.parsfilo.astrology.core.data.repository

import android.database.sqlite.SQLiteException
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.local.QueuedEventDao
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.MoodInsight
import com.parsfilo.astrology.core.data.remote.MoodInsightResponse
import com.parsfilo.astrology.core.data.remote.MoodLogResponse
import com.parsfilo.astrology.core.data.session.AuthenticatedRequestExecutor
import com.parsfilo.astrology.core.domain.model.UserPreferences
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.DispatchersProvider
import io.mockk.coEvery
import io.mockk.coJustRun
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class MoodRepositoryTest {
    private val api = mockk<AstrologyApi>()
    private val sessionRepository = mockk<SessionRepository>()
    private val queuedEventDao = mockk<QueuedEventDao>()
    private val preferencesRepository = mockk<UserPreferencesRepository>()
    private val syncGate = MoodAnalyticsSyncGate()
    private val dispatcher = UnconfinedTestDispatcher()
    private val repository =
        MoodRepository(
            api = api,
            sessionRepository = sessionRepository,
            queuedEventDao = queuedEventDao,
            preferencesRepository = preferencesRepository,
            syncGate = syncGate,
            requestExecutor = AuthenticatedRequestExecutor(),
            dispatchers =
                DispatchersProvider(
                    main = dispatcher,
                    io = dispatcher,
                    default = dispatcher,
                ),
        )

    init {
        coEvery { preferencesRepository.current() } returns UserPreferences(userId = "owner-A")
    }

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
            coJustRun { queuedEventDao.deleteByType(AnalyticsEvents.MOOD_LOGGED, "owner-A") }

            val result = repository.deleteMoodHistory()

            assertThat(result).isInstanceOf(AppResult.Success::class.java)
            assertThat(repository.historyDeletionRevision.value).isEqualTo(1L)
            coVerify(exactly = 1) { queuedEventDao.deleteByType(AnalyticsEvents.MOOD_LOGGED, "owner-A") }
        }

    @Test
    fun `deletion waits for an in-flight mood log to avoid restoring erased history`() =
        runTest {
            val logStarted = CompletableDeferred<Unit>()
            val finishLog = CompletableDeferred<Unit>()
            coEvery { api.logMood(any()) } coAnswers {
                logStarted.complete(Unit)
                finishLog.await()
                Response.success(MoodLogResponse(date = "2026-10-30", mood = "good", domain = null))
            }
            coEvery { api.deleteMoodHistory() } returns Response.success(Unit)
            coJustRun { queuedEventDao.deleteByType(AnalyticsEvents.MOOD_LOGGED, "owner-A") }

            val log = async { repository.logMood("good", null) }
            logStarted.await()
            val delete = async { repository.deleteMoodHistory() }
            runCurrent()

            // A deletion must not reach D1 while an older mood insertion is in flight.
            coVerify(exactly = 0) { api.deleteMoodHistory() }
            finishLog.complete(Unit)
            assertThat(log.await()).isInstanceOf(AppResult.Success::class.java)
            assertThat(delete.await()).isInstanceOf(AppResult.Success::class.java)
            coVerify(exactly = 1) { api.deleteMoodHistory() }
        }

    @Test
    fun `pending analytics delivery blocks remote deletion until in-flight write settles`() =
        runTest {
            val entered = CompletableDeferred<Unit>()
            val resume = CompletableDeferred<Unit>()
            coEvery { api.deleteMoodHistory() } returns Response.success(Unit)
            coJustRun { queuedEventDao.deleteByType(AnalyticsEvents.MOOD_LOGGED, "owner-A") }

            val inFlight =
                async {
                    syncGate.withLock {
                        entered.complete(Unit)
                        resume.await()
                    }
                }
            entered.await()
            val delete = async { repository.deleteMoodHistory() }
            runCurrent()

            coVerify(exactly = 0) { api.deleteMoodHistory() }
            resume.complete(Unit)
            assertThat(delete.await()).isInstanceOf(AppResult.Success::class.java)
            coVerify(exactly = 1) { api.deleteMoodHistory() }
            coVerify(exactly = 1) { queuedEventDao.deleteByType(AnalyticsEvents.MOOD_LOGGED, "owner-A") }
            inFlight.await()
        }

    @Test
    fun `deletion waits for analytics after successful mood insertion`() =
        runTest {
            val analyticsStarted = CompletableDeferred<Unit>()
            val finishAnalytics = CompletableDeferred<Unit>()
            coEvery { api.logMood(any()) } returns
                Response.success(MoodLogResponse(date = "2026-10-31", mood = "good", domain = null))
            coEvery { api.deleteMoodHistory() } returns Response.success(Unit)
            coJustRun { queuedEventDao.deleteByType(AnalyticsEvents.MOOD_LOGGED, "owner-A") }

            val log =
                async {
                    repository.logMood("good", null) {
                        analyticsStarted.complete(Unit)
                        finishAnalytics.await()
                    }
                }
            analyticsStarted.await()
            val delete = async { repository.deleteMoodHistory() }
            runCurrent()

            // The mood was written, but its analytics callback is still in flight:
            // deletion must not run before that callback settles.
            coVerify(exactly = 0) { api.deleteMoodHistory() }
            finishAnalytics.complete(Unit)
            assertThat(log.await()).isInstanceOf(AppResult.Success::class.java)
            assertThat(delete.await()).isInstanceOf(AppResult.Success::class.java)
            coVerify(exactly = 1) { api.deleteMoodHistory() }
            coVerify(exactly = 1) { queuedEventDao.deleteByType(AnalyticsEvents.MOOD_LOGGED, "owner-A") }
        }

    @Test
    fun `failed mood insertion never emits a mood analytics event`() =
        runTest {
            coEvery { api.logMood(any()) } returns Response.error(503, "offline".toResponseBody())
            var called = false
            val result = repository.logMood("good", null) { called = true }
            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat(called).isFalse()
        }

    @Test
    fun `failed local queue cleanup reports retryable deletion instead of success`() =
        runTest {
            coEvery { api.deleteMoodHistory() } returns Response.success(Unit)
            coEvery { queuedEventDao.deleteByType(AnalyticsEvents.MOOD_LOGGED, "owner-A") } throws
                SQLiteException("synthetic SQLite failure")

            val result = repository.deleteMoodHistory()

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat(repository.historyDeletionRevision.value).isEqualTo(0L)
        }

    @Test
    fun `mood history deletion reports failure and does not claim data removed`() =
        runTest {
            coEvery { api.deleteMoodHistory() } returns Response.error(503, "offline".toResponseBody())

            val result = repository.deleteMoodHistory()

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat(repository.historyDeletionRevision.value).isEqualTo(0L)
            coVerify(exactly = 0) { queuedEventDao.deleteByType(any(), any()) }
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
