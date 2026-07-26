package com.parsfilo.astrology.core.data.local

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class QueuedEventDaoTest {
    private lateinit var database: AstrologyDatabase
    private lateinit var dao: QueuedEventDao

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database =
            Room
                .inMemoryDatabaseBuilder(context, AstrologyDatabase::class.java)
                .allowMainThreadQueries()
                .build()
        dao = database.queuedEventDao()
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun `bounded enqueue removes expired and oldest excess events atomically`() =
        runTest {
            val now = 2_000_000_000_000L
            dao.upsert(event(id = "expired", createdAt = now - THIRTY_ONE_DAYS_MILLIS))
            repeat(MAX_SIZE) { index ->
                dao.upsert(event(id = "recent-$index", createdAt = now + index))
            }

            dao.enqueueBounded(
                entity = event(id = "newest", createdAt = now + MAX_SIZE),
                maxSize = MAX_SIZE,
                minCreatedAt = now - THIRTY_DAYS_MILLIS,
            )

            val queued = dao.getBatch(MAX_SIZE + 10)
            val ids = queued.map { it.id }

            assertThat(queued).hasSize(MAX_SIZE)
            assertThat(ids).doesNotContain("expired")
            assertThat(ids).doesNotContain("recent-0")
            assertThat(ids).contains("newest")
        }

    @Test
    fun `bounded enqueue rejects an incoming expired event`() =
        runTest {
            val now = 2_000_000_000_000L
            val minCreatedAt = now - THIRTY_DAYS_MILLIS

            dao.enqueueBounded(
                entity = event(id = "incoming-expired", createdAt = minCreatedAt - 1L),
                maxSize = MAX_SIZE,
                minCreatedAt = minCreatedAt,
            )

            assertThat(dao.getBatch(10)).isEmpty()
        }

    private fun event(
        id: String,
        createdAt: Long,
    ): QueuedEventEntity =
        QueuedEventEntity(
            id = id,
            type = "app_open",
            payload = "{}",
            createdAt = createdAt,
        )

    private companion object {
        const val MAX_SIZE = 500
        const val THIRTY_DAYS_MILLIS = 30L * 24L * 60L * 60L * 1_000L
        const val THIRTY_ONE_DAYS_MILLIS = 31L * 24L * 60L * 60L * 1_000L
    }
}
