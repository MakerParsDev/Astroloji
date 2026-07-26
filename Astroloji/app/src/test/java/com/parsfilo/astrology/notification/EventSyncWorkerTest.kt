package com.parsfilo.astrology.notification

import android.content.Context
import androidx.work.ListenableWorker
import androidx.work.WorkerParameters
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.local.QueuedEventDao
import com.parsfilo.astrology.core.data.local.QueuedEventEntity
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.TrackEventResponse
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Response
import java.io.IOException

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class EventSyncWorkerTest {
    private val context = mockk<Context>()
    private val workerParameters = mockk<WorkerParameters>(relaxed = true)
    private val queuedEventDao = mockk<QueuedEventDao>(relaxed = true)
    private val api = mockk<AstrologyApi>()

    init {
        every { context.applicationContext } returns context
    }

    @Test
    fun `loads at most fifty events and succeeds when the batch is empty`() =
        runTest {
            coEvery { queuedEventDao.getBatch(50) } returns emptyList()

            val result = createWorker().doWork()

            assertThat(result).isInstanceOf(ListenableWorker.Result.Success::class.java)
            coVerify(exactly = 1) { queuedEventDao.getBatch(50) }
        }

    @Test
    fun `deletes malformed and permanently rejected events without retrying`() =
        runTest {
            val malformed = event(id = "malformed", payload = "not-json")
            val rejected = event(id = "rejected", payload = "{}")
            coEvery { queuedEventDao.getBatch(50) } returns listOf(malformed, rejected)
            coEvery { api.trackEvent(any()) } returns Response.error(400, "invalid".toResponseBody())

            val result = createWorker().doWork()

            assertThat(result).isInstanceOf(ListenableWorker.Result.Success::class.java)
            coVerify(exactly = 1) { queuedEventDao.delete("malformed") }
            coVerify(exactly = 1) { queuedEventDao.delete("rejected") }
            coVerify(exactly = 1) { api.trackEvent(any()) }
        }

    @Test
    fun `retries transient server responses without deleting the event`() =
        runTest {
            val event = event(id = "retry", payload = "{}")
            coEvery { queuedEventDao.getBatch(50) } returns listOf(event)
            coEvery { api.trackEvent(any()) } returns Response.error(503, "unavailable".toResponseBody())

            val result = createWorker().doWork()

            assertThat(result).isInstanceOf(ListenableWorker.Result.Retry::class.java)
            coVerify(exactly = 0) { queuedEventDao.delete(any()) }
        }

    @Test
    fun `retries network failures without deleting the event`() =
        runTest {
            val event = event(id = "offline", payload = "{}")
            coEvery { queuedEventDao.getBatch(50) } returns listOf(event)
            coEvery { api.trackEvent(any()) } throws IOException("offline")

            val result = createWorker().doWork()

            assertThat(result).isInstanceOf(ListenableWorker.Result.Retry::class.java)
            coVerify(exactly = 0) { queuedEventDao.delete(any()) }
        }

    @Test
    fun `deletes successfully delivered events`() =
        runTest {
            val delivered = event(id = "delivered", payload = "{}")
            coEvery { queuedEventDao.getBatch(50) } returns listOf(delivered)
            coEvery { api.trackEvent(any()) } returns Response.success(TrackEventResponse(ok = true))

            val result = createWorker().doWork()

            assertThat(result).isInstanceOf(ListenableWorker.Result.Success::class.java)
            coVerify(exactly = 1) { queuedEventDao.delete("delivered") }
        }

    private fun createWorker(): EventSyncWorker =
        EventSyncWorker(
            appContext = context,
            workerParams = workerParameters,
            queuedEventDao = queuedEventDao,
            api = api,
        )

    private fun event(
        id: String,
        payload: String,
    ): QueuedEventEntity =
        QueuedEventEntity(
            id = id,
            type = "app_open",
            payload = payload,
            createdAt = 1L,
        )
}
