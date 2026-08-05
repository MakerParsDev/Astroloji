package com.parsfilo.astrology.core.data.repository

import com.google.firebase.analytics.FirebaseAnalytics
import com.parsfilo.astrology.core.data.local.QueuedEventDao
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import io.mockk.coEvery
import io.mockk.coJustRun
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Response
import java.io.IOException

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class AnalyticsRepositoryTest {
    private val firebaseAnalytics = mockk<FirebaseAnalytics>(relaxed = true)
    private val api = mockk<AstrologyApi>()
    private val queuedEventDao = mockk<QueuedEventDao>(relaxed = true)
    private val repository =
        AnalyticsRepository(
            firebaseAnalytics = firebaseAnalytics,
            api = api,
            queuedEventDao = queuedEventDao,
            json = Json,
        )

    @Test
    fun `does not queue permanently rejected client events`() =
        runTest {
            coEvery { api.trackEvent(any()) } returns Response.error(400, "invalid".toResponseBody())

            repository.track(AnalyticsEvents.DAILY_VIEWED, mapOf("sign" to "aries"))

            coVerify(exactly = 0) { queuedEventDao.enqueueBounded(any(), any(), any()) }
            coVerify(exactly = 0) { queuedEventDao.upsert(any()) }
        }

    @Test
    fun `queues server failures with capacity and retention limits`() =
        runTest {
            coEvery { api.trackEvent(any()) } returns Response.error(503, "unavailable".toResponseBody())
            coJustRun { queuedEventDao.enqueueBounded(any(), any(), any()) }
            val before = System.currentTimeMillis()

            repository.track(AnalyticsEvents.WEEKLY_VIEWED)

            val after = System.currentTimeMillis()
            coVerify(exactly = 1) {
                queuedEventDao.enqueueBounded(
                    match { it.type == AnalyticsEvents.WEEKLY_VIEWED },
                    500,
                    match { cutoff ->
                        cutoff in (before - THIRTY_DAYS_MILLIS)..(after - THIRTY_DAYS_MILLIS)
                    },
                )
            }
        }

    @Test
    fun `queues network failures without exposing payloads`() =
        runTest {
            coEvery { api.trackEvent(any()) } throws IOException("offline")
            coJustRun { queuedEventDao.enqueueBounded(any(), any(), any()) }

            repository.track(AnalyticsEvents.APP_OPEN, mapOf("private" to "value"))

            coVerify(exactly = 1) {
                queuedEventDao.enqueueBounded(
                    match { it.type == AnalyticsEvents.APP_OPEN },
                    500,
                    any(),
                )
            }
        }

    @Test
    fun `drops non allowlisted analytics metadata before network and queue delivery`() =
        runTest {
            val requestSlot = slot<com.parsfilo.astrology.core.data.remote.TrackEventRequest>()
            val queuedSlot = slot<com.parsfilo.astrology.core.data.local.QueuedEventEntity>()
            coEvery { api.trackEvent(capture(requestSlot)) } throws IOException("offline")
            coJustRun { queuedEventDao.enqueueBounded(capture(queuedSlot), any(), any()) }

            repository.track(
                AnalyticsEvents.ONBOARDING_COMPLETED,
                mapOf(
                    "sign" to "aries",
                    "locale" to "tr",
                    "sign1" to "aries",
                    "sign2" to "leo",
                    "email" to "person@example.com",
                    "birth_date" to "1990-01-01",
                    "free_text" to "private journal entry",
                ),
            )

            assert(
                requestSlot.captured.meta ==
                    mapOf(
                        "sign" to "aries",
                        "locale" to "tr",
                        "sign1" to "aries",
                        "sign2" to "leo",
                    ),
            )
            assert(
                queuedSlot.captured.payload ==
                    "{\"sign\":\"aries\",\"locale\":\"tr\",\"sign1\":\"aries\",\"sign2\":\"leo\"}",
            )
        }

    private companion object {
        const val THIRTY_DAYS_MILLIS = 30L * 24L * 60L * 60L * 1_000L
    }
}
