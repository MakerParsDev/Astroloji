package com.parsfilo.astrology.notification

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.parsfilo.astrology.core.data.local.QueuedEventDao
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.TrackEventRequest
import com.parsfilo.astrology.core.data.repository.ANALYTICS_EVENT_RETENTION_MILLIS
import com.parsfilo.astrology.core.data.repository.MoodAnalyticsSyncGate
import com.parsfilo.astrology.core.data.repository.sanitizeAnalyticsMeta
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import java.io.IOException

@HiltWorker
class EventSyncWorker
    @AssistedInject
    constructor(
        @Assisted appContext: Context,
        @Assisted workerParams: WorkerParameters,
        private val queuedEventDao: QueuedEventDao,
        private val api: AstrologyApi,
        private val preferencesRepository: UserPreferencesRepository,
        private val syncGate: MoodAnalyticsSyncGate,
    ) : CoroutineWorker(appContext, workerParams) {
        override suspend fun doWork(): Result =
            withContext(Dispatchers.IO) {
                // Hold the same gate as account-preserving mood deletion through
                // the whole network-write + queue-removal batch.
                syncGate.withLock {
                    // A queue can sit offline for longer than the 30-day policy
                    // without any new enqueue operation to trigger its cleanup.
                    // Prune before reading so old events are never replayed.
                    queuedEventDao.deleteOlderThan(System.currentTimeMillis() - ANALYTICS_EVENT_RETENTION_MILLIS)
                    // A full batch does not mean the backlog is empty. Drain
                    // a few more while online, but cap event attempts per
                    // scheduled run rather than looping through an unlimited queue.
                    repeat(MAX_SYNC_BATCHES) {
                        val queued = queuedEventDao.getBatch(SYNC_BATCH_SIZE)
                        if (queued.isEmpty()) return@withLock Result.success()
                        queued.forEach { event ->
                            // The row was created for a specific authenticated account.
                            // Empty legacy owners or rows from a prior account must
                            // never be replayed under this device's current JWT.
                            val currentOwner = preferencesRepository.current().userId
                            if (event.ownerUserId.isBlank() || event.ownerUserId != currentOwner) {
                                queuedEventDao.delete(event.id)
                                return@forEach
                            }
                            val meta =
                                runCatching {
                                    Json.decodeFromString(MapSerializer(String.serializer(), String.serializer()), event.payload)
                                }.getOrNull()
                            if (meta == null) {
                                queuedEventDao.delete(event.id)
                                return@forEach
                            }

                            val response =
                                try {
                                    api.trackEvent(
                                        TrackEventRequest(
                                            eventType = event.type,
                                            meta = sanitizeAnalyticsMeta(event.type, meta),
                                            eventId = event.id,
                                            ownerUserId = event.ownerUserId,
                                        ),
                                    )
                                } catch (exception: CancellationException) {
                                    throw exception
                                } catch (_: IOException) {
                                    return@withLock Result.retry()
                                }

                            when (classifyAnalyticsResponse(response.code())) {
                                AnalyticsDeliveryDisposition.DELIVERED,
                                AnalyticsDeliveryDisposition.PERMANENT_FAILURE,
                                -> queuedEventDao.delete(event.id)
                                AnalyticsDeliveryDisposition.RETRY -> return@withLock Result.retry()
                            }
                        }
                        if (queued.size < SYNC_BATCH_SIZE) return@withLock Result.success()
                    }
                    Result.success()
                }
            }

        private companion object {
            const val SYNC_BATCH_SIZE = 50
            const val MAX_SYNC_BATCHES = 3
        }
    }
