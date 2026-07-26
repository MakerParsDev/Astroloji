package com.parsfilo.astrology.notification

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.parsfilo.astrology.core.data.local.QueuedEventDao
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.TrackEventRequest
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

@HiltWorker
class EventSyncWorker
    @AssistedInject
    constructor(
        @Assisted appContext: Context,
        @Assisted workerParams: WorkerParameters,
        private val queuedEventDao: QueuedEventDao,
        private val api: AstrologyApi,
    ) : CoroutineWorker(appContext, workerParams) {
        override suspend fun doWork(): Result =
            withContext(Dispatchers.IO) {
                val queued = queuedEventDao.getBatch(SYNC_BATCH_SIZE)
                if (queued.isEmpty()) return@withContext Result.success()
                queued.forEach { event ->
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
                                    meta = meta,
                                ),
                            )
                        } catch (exception: CancellationException) {
                            throw exception
                        } catch (_: Exception) {
                            return@withContext Result.retry()
                        }

                    when (classifyAnalyticsResponse(response.code())) {
                        AnalyticsDeliveryDisposition.DELIVERED,
                        AnalyticsDeliveryDisposition.PERMANENT_FAILURE,
                        -> queuedEventDao.delete(event.id)
                        AnalyticsDeliveryDisposition.RETRY -> return@withContext Result.retry()
                    }
                }
                Result.success()
            }

        private companion object {
            const val SYNC_BATCH_SIZE = 50
        }
    }
