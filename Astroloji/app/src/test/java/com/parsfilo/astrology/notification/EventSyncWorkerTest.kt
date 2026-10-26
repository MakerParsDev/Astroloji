package com.parsfilo.astrology.notification

import android.content.Context
import androidx.work.ListenableWorker
import androidx.work.WorkerParameters
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.local.QueuedEventDao
import com.parsfilo.astrology.core.data.local.QueuedEventEntity
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.TrackEventResponse
import com.parsfilo.astrology.core.data.repository.ANALYTICS_EVENT_RETENTION_MILLIS
import com.parsfilo.astrology.core.data.repository.MoodAnalyticsSyncGate
import com.parsfilo.astrology.core.domain.model.UserPreferences
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.coVerifyOrder
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
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
    private val preferencesRepository = mockk<UserPreferencesRepository>()
    private val syncGate = MoodAnalyticsSyncGate()

    init {
        coEvery { preferencesRepository.current() } returns UserPreferences(userId = "owner-A")
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
    fun `prunes expired offline events before querying the queue for delivery`() =
        runTest {
            val now = System.currentTimeMillis()
            val olderThanThirtyDays = now - ANALYTICS_EVENT_RETENTION_MILLIS - 1
            val fresh = event(id = "fresh", payload = "{}").copy(createdAt = now - 1_000L)
            // The mock acts like Room after its DELETE WHERE createdAt < cutoff:
            // a stored 31-day-old event is deleted, not returned in getBatch.
            val remaining =
                mutableListOf(
                    event(id = "expired", payload = "{}").copy(createdAt = olderThanThirtyDays),
                    fresh,
                )
            coEvery { queuedEventDao.deleteOlderThan(any()) } coAnswers {
                val cutoff = firstArg<Long>()
                remaining.removeAll { it.createdAt < cutoff }
                Unit
            }
            coEvery { queuedEventDao.getBatch(50) } coAnswers { remaining.take(50) }
            coEvery { queuedEventDao.delete(any()) } coAnswers {
                val id = firstArg<String>()
                remaining.removeAll { it.id == id }
                Unit
            }
            coEvery { api.trackEvent(any()) } returns Response.success(TrackEventResponse(ok = true))
            val sent = mutableListOf<com.parsfilo.astrology.core.data.remote.TrackEventRequest>()
            coEvery { api.trackEvent(capture(sent)) } returns Response.success(TrackEventResponse(ok = true))

            assertThat(createWorker().doWork()).isInstanceOf(ListenableWorker.Result.Success::class.java)
            assertThat(sent.map { it.eventId }).containsExactly("fresh")
            assertThat(remaining).isEmpty()
            coVerify(exactly = 1) {
                queuedEventDao.deleteOlderThan(
                    match {
                        it in
                            (now - ANALYTICS_EVENT_RETENTION_MILLIS - 10_000L)..now
                    },
                )
            }
            coVerifyOrder {
                queuedEventDao.deleteOlderThan(any())
                queuedEventDao.getBatch(50)
            }
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
    fun `drains fifty plus one queued events in a single successful run`() =
        runTest {
            val firstBatch = (1..50).map { event(id = "first-$it", payload = "{}") }
            val last = event(id = "last", payload = "{}")
            val sent = mutableListOf<com.parsfilo.astrology.core.data.remote.TrackEventRequest>()
            coEvery { queuedEventDao.getBatch(50) } returnsMany listOf(firstBatch, listOf(last))
            coEvery { api.trackEvent(capture(sent)) } returns Response.success(TrackEventResponse(ok = true))

            assertThat(createWorker().doWork()).isInstanceOf(ListenableWorker.Result.Success::class.java)

            coVerify(exactly = 2) { queuedEventDao.getBatch(50) }
            coVerify(exactly = 51) { api.trackEvent(any()) }
            assertThat(sent.map { it.eventId }.toSet()).containsExactlyElementsIn(
                (firstBatch + last).map { it.id },
            )
            assertThat(sent.map { it.ownerUserId }.distinct()).containsExactly("owner-A")
            coVerify(exactly = 1) { queuedEventDao.delete(last.id) }
        }

    @Test
    fun `bounded draining stops after three full batches in one run`() =
        runTest {
            val batches =
                (1..4).map { batch ->
                    (1..50).map { offset -> event("batch-$batch-item-$offset", "{}") }
                }
            coEvery { queuedEventDao.getBatch(50) } returnsMany batches
            coEvery { api.trackEvent(any()) } returns Response.success(TrackEventResponse(ok = true))

            assertThat(createWorker().doWork()).isInstanceOf(ListenableWorker.Result.Success::class.java)

            coVerify(exactly = 3) { queuedEventDao.getBatch(50) }
            coVerify(exactly = 150) { api.trackEvent(any()) }
            coVerify(exactly = 0) { queuedEventDao.delete(batches[3][0].id) }
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
    fun `partial batch retry sends only the unacknowledged event on next run`() =
        runTest {
            val first = event(id = "delivered-first", payload = "{}").copy(type = "daily_viewed")
            val second = event(id = "retry-second", payload = "{}").copy(type = "weekly_viewed")
            // The second run simulates the queue after the first acknowledged row
            // was deleted. A server-side timeout before acknowledgment remains
            // an at-least-once delivery case, not a deduplication guarantee.
            coEvery { queuedEventDao.getBatch(50) } returnsMany
                listOf(listOf(first, second), listOf(second))
            coEvery {
                api.trackEvent(match { it.eventType == "daily_viewed" })
            } returns Response.success(TrackEventResponse(ok = true))
            coEvery {
                api.trackEvent(match { it.eventType == "weekly_viewed" })
            } returnsMany
                listOf(
                    Response.error(503, "unavailable".toResponseBody()),
                    Response.success(TrackEventResponse(ok = true)),
                )

            assertThat(createWorker().doWork()).isInstanceOf(ListenableWorker.Result.Retry::class.java)
            coVerify(exactly = 1) { queuedEventDao.delete(first.id) }
            coVerify(exactly = 0) { queuedEventDao.delete(second.id) }

            assertThat(createWorker().doWork()).isInstanceOf(ListenableWorker.Result.Success::class.java)
            coVerify(exactly = 1) {
                api.trackEvent(match { it.eventType == "daily_viewed" })
            }
            coVerify(exactly = 2) {
                api.trackEvent(match { it.eventType == "weekly_viewed" })
            }
            coVerify(exactly = 1) { queuedEventDao.delete(first.id) }
            coVerify(exactly = 1) { queuedEventDao.delete(second.id) }
        }

    @Test
    fun `retries a queued event using the same durable event ID`() =
        runTest {
            val item = event(id = "01234567-89ab-4cde-8f01-23456789abcd", payload = "{}")
            val requests = mutableListOf<com.parsfilo.astrology.core.data.remote.TrackEventRequest>()
            coEvery { queuedEventDao.getBatch(50) } returns listOf(item)
            coEvery { api.trackEvent(capture(requests)) } returnsMany
                listOf(
                    Response.error(503, "retry".toResponseBody()),
                    Response.success(TrackEventResponse(ok = true)),
                )

            assertThat(createWorker().doWork()).isInstanceOf(ListenableWorker.Result.Retry::class.java)
            assertThat(createWorker().doWork()).isInstanceOf(ListenableWorker.Result.Success::class.java)
            assertThat(requests).hasSize(2)
            assertThat(requests[0].eventId).isEqualTo(item.id)
            assertThat(requests[1].eventId).isEqualTo(item.id)
            coVerify(exactly = 1) { queuedEventDao.delete(item.id) }
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

    @Test
    fun `strips mood details from legacy offline events while preserving event count`() =
        runTest {
            val legacy =
                event(
                    id = "legacy-mood",
                    payload = """{"mood":"stressed","source":"home"}""",
                ).copy(type = "mood_logged")
            val submitted = slot<com.parsfilo.astrology.core.data.remote.TrackEventRequest>()
            coEvery { queuedEventDao.getBatch(50) } returns listOf(legacy)
            coEvery { api.trackEvent(capture(submitted)) } returns
                Response.success(TrackEventResponse(ok = true))

            val result = createWorker().doWork()

            assertThat(result).isInstanceOf(ListenableWorker.Result.Success::class.java)
            assertThat(submitted.captured.eventType).isEqualTo("mood_logged")
            assertThat(submitted.captured.meta).isEmpty()
            coVerify(exactly = 1) { queuedEventDao.delete("legacy-mood") }
        }

    @Test
    fun `still delivers benign allowlisted metadata from offline events`() =
        runTest {
            val old = event(id = "other", payload = """{"sign":"aries","email":"private@example.com"}""")
            val submitted = slot<com.parsfilo.astrology.core.data.remote.TrackEventRequest>()
            coEvery { queuedEventDao.getBatch(50) } returns listOf(old)
            coEvery { api.trackEvent(capture(submitted)) } returns
                Response.success(TrackEventResponse(ok = true))

            assertThat(createWorker().doWork()).isInstanceOf(ListenableWorker.Result.Success::class.java)
            assertThat(submitted.captured.meta).containsExactly("sign", "aries")
        }

    @Test
    fun `drops a legacy event without an account owner before network submission`() =
        runTest {
            val legacy = event("legacy-unknown", "{}").copy(ownerUserId = "")
            coEvery { queuedEventDao.getBatch(50) } returns listOf(legacy)

            assertThat(createWorker().doWork()).isInstanceOf(ListenableWorker.Result.Success::class.java)
            coVerify(exactly = 1) { queuedEventDao.delete(legacy.id) }
            coVerify(exactly = 0) { api.trackEvent(any()) }
        }

    @Test
    fun `never posts a previous account event under a new login`() =
        runTest {
            val old = event("account-A-event", "{}")
            coEvery { queuedEventDao.getBatch(50) } returns listOf(old)
            coEvery { preferencesRepository.current() } returns UserPreferences(userId = "owner-B")

            assertThat(createWorker().doWork()).isInstanceOf(ListenableWorker.Result.Success::class.java)
            coVerify(exactly = 1) { queuedEventDao.delete(old.id) }
            coVerify(exactly = 0) { api.trackEvent(any()) }
        }

    @Test
    fun `rechecks account between queued events when login changes mid batch`() =
        runTest {
            val first = event("owner-A-first", "{}")
            val second = event("owner-A-second", "{}")
            coEvery { queuedEventDao.getBatch(50) } returns listOf(first, second)
            coEvery { preferencesRepository.current() } returnsMany
                listOf(UserPreferences(userId = "owner-A"), UserPreferences(userId = "owner-B"))
            coEvery { api.trackEvent(any()) } returns Response.success(TrackEventResponse(ok = true))
            val sent = slot<com.parsfilo.astrology.core.data.remote.TrackEventRequest>()
            coEvery { api.trackEvent(capture(sent)) } returns Response.success(TrackEventResponse(ok = true))

            assertThat(createWorker().doWork()).isInstanceOf(ListenableWorker.Result.Success::class.java)
            coVerify(exactly = 1) { api.trackEvent(any()) }
            assertThat(sent.captured.ownerUserId).isEqualTo("owner-A")
            coVerify(exactly = 1) { queuedEventDao.delete(first.id) }
            coVerify(exactly = 1) { queuedEventDao.delete(second.id) }
        }

    private fun createWorker(): EventSyncWorker =
        EventSyncWorker(
            appContext = context,
            workerParams = workerParameters,
            queuedEventDao = queuedEventDao,
            api = api,
            preferencesRepository = preferencesRepository,
            syncGate = syncGate,
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
            ownerUserId = "owner-A",
        )
}
