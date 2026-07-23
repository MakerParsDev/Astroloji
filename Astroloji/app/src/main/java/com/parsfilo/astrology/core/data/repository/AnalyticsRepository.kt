package com.parsfilo.astrology.core.data.repository

import android.os.Bundle
import com.google.firebase.analytics.FirebaseAnalytics
import com.parsfilo.astrology.core.data.local.QueuedEventDao
import com.parsfilo.astrology.core.data.local.QueuedEventEntity
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.TrackEventRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import timber.log.Timber
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

object AnalyticsEvents {
    const val APP_OPEN = "app_open"
    const val SIGN_SELECTED = "sign_selected"
    const val DAILY_VIEWED = "daily_viewed"
    const val WEEKLY_VIEWED = "weekly_viewed"
    const val MONTHLY_VIEWED = "monthly_viewed"
    const val COMPAT_CHECKED = "compat_checked"
    const val PERSONALITY_VIEWED = "personality_viewed"
    const val SHARE_CLICKED = "share_clicked"
    const val PREMIUM_SCREEN_VIEWED = "premium_screen_viewed"
    const val PREMIUM_PURCHASED = "premium_purchased"
    const val PREMIUM_RESTORED = "premium_restored"
    const val NOTIFICATION_TAPPED = "notification_tapped"
    const val AD_SHOWN = "ad_shown"
    const val STREAK_ACHIEVED = "streak_achieved"
}

@Singleton
class AnalyticsRepository
    @Inject
    constructor(
        private val firebaseAnalytics: FirebaseAnalytics,
        private val api: AstrologyApi,
        private val queuedEventDao: QueuedEventDao,
        private val json: Json,
    ) {
        suspend fun track(
            eventType: String,
            meta: Map<String, String> = emptyMap(),
        ) = withContext(Dispatchers.IO) {
            firebaseAnalytics.logEvent(
                eventType,
                Bundle().apply {
                    meta.forEach { (key, value) -> putString(key, value) }
                },
            )
            runCatching {
                val response = api.trackEvent(TrackEventRequest(eventType = eventType, meta = meta))
                if (!response.isSuccessful) error("Backend event rejected with ${response.code()}")
            }.onFailure {
                Timber.w(it, "Queueing analytics event: %s", eventType)
                queuedEventDao.upsert(
                    QueuedEventEntity(
                        id = UUID.randomUUID().toString(),
                        type = eventType,
                        payload = json.encodeToString(MapSerializer(String.serializer(), String.serializer()), meta),
                        createdAt = System.currentTimeMillis(),
                    ),
                )
            }
        }
    }
