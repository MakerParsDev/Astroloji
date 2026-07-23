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
                val queued = queuedEventDao.getAll()
                if (queued.isEmpty()) return@withContext Result.success()
                queued.forEach { event ->
                    val meta =
                        runCatching {
                            Json.decodeFromString(MapSerializer(String.serializer(), String.serializer()), event.payload)
                        }.getOrDefault(emptyMap())
                    val response =
                        api.trackEvent(
                            TrackEventRequest(
                                eventType = event.type,
                                meta = meta,
                            ),
                        )
                    if (response.isSuccessful) {
                        queuedEventDao.delete(event.id)
                    }
                }
                Result.success()
            }
    }
