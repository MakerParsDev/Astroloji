package com.parsfilo.astrology.core.data.repository

import android.os.Bundle
import com.google.firebase.analytics.FirebaseAnalytics
import com.parsfilo.astrology.core.data.local.QueuedEventDao
import com.parsfilo.astrology.core.data.local.QueuedEventEntity
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.TrackEventRequest
import com.parsfilo.astrology.notification.AnalyticsDeliveryDisposition
import com.parsfilo.astrology.notification.classifyAnalyticsResponse
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import timber.log.Timber
import java.io.IOException
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
    const val ONBOARDING_STARTED = "onboarding_started"
    const val ONBOARDING_STEP_VIEWED = "onboarding_step_viewed"
    const val ONBOARDING_COMPLETED = "onboarding_completed"
    const val ONBOARDING_REGISTRATION_FAILED = "onboarding_registration_failed"
    const val NOTIFICATION_PERMISSION_RESULT = "notification_permission_result"
    const val PAYWALL_VIEWED = "paywall_viewed"
    const val PAYWALL_PLAN_SELECTED = "paywall_plan_selected"
    const val PURCHASE_STARTED = "purchase_started"
    const val PURCHASE_SUCCEEDED = "purchase_succeeded"
    const val PURCHASE_FAILED = "purchase_failed"
    const val PURCHASE_CANCELLED = "purchase_cancelled"
    const val TRIAL_STARTED = "trial_started"
    const val FRIEND_INVITED = "friend_invited"
    const val FRIEND_ACCEPTED = "friend_accepted"
    const val CREDIT_PURCHASED = "credit_purchased"
    const val CREDIT_SPENT = "credit_spent"
    const val DEEP_READING_VIEWED = "deep_reading_viewed"
    const val MOOD_LOGGED = "mood_logged"
    const val REWARDED_AD_STARTED = "rewarded_ad_started"
    const val REWARDED_AD_COMPLETED = "rewarded_ad_completed"
    const val REWARDED_AD_FAILED = "rewarded_ad_failed"
    const val SHARE_COMPLETED = "share_completed"
    const val DAILY_FEEDBACK_SUBMITTED = "daily_feedback_submitted"
}

private val ALLOWED_ANALYTICS_META_KEYS =
    setOf(
        "source",
        "variant", // Non-identifying Remote Config paywall experiment arm.
        "step",
        "result",
        "plan",
        "product",
        "placement",
        "sign",
        "sign1",
        "sign2",
        "locale",
        "reason",
        "format",
        "credits",
        "feature",
        "cached",
        "milestone",
    )

// Mood is personal wellbeing data. Preserve the event count, never its details in analytics.
internal fun sanitizeAnalyticsMeta(
    eventType: String,
    meta: Map<String, String>,
): Map<String, String> =
    if (eventType == AnalyticsEvents.MOOD_LOGGED) {
        emptyMap()
    } else {
        meta.filterKeys(ALLOWED_ANALYTICS_META_KEYS::contains)
    }

// One retention policy for both insertion-time bounded queues and offline replay.
internal const val ANALYTICS_EVENT_RETENTION_MILLIS = 30L * 24L * 60L * 60L * 1_000L

@Singleton
class AnalyticsRepository
    @Inject
    constructor(
        private val firebaseAnalytics: FirebaseAnalytics,
        private val api: AstrologyApi,
        private val queuedEventDao: QueuedEventDao,
        private val preferencesRepository: UserPreferencesRepository,
        private val syncGate: MoodAnalyticsSyncGate,
        private val json: Json,
    ) {
        suspend fun enqueue(
            eventType: String,
            meta: Map<String, String> = emptyMap(),
        ) = withContext(Dispatchers.IO) {
            withMoodGate(eventType) {
                val safeMeta = sanitizeAnalyticsMeta(eventType, meta)
                logFirebaseEvent(eventType, safeMeta)
                // Unattributed onboarding events stay in Firebase Analytics only.
                // They must not be delivered as a future account's backend events.
                val ownerId = preferencesRepository.current().userId?.takeIf { it.isNotBlank() }
                if (ownerId != null) queueEvent(eventType, safeMeta, ownerUserId = ownerId)
            }
        }

        suspend fun track(
            eventType: String,
            meta: Map<String, String> = emptyMap(),
        ) = withContext(Dispatchers.IO) {
            withMoodGate(eventType) {
                trackWithoutGate(eventType, meta)
            }
        }

        /**
         * Called only by MoodRepository while it already holds MoodAnalyticsSyncGate.
         * Re-locking through track(MOOD_LOGGED) here would deadlock.
         */
        internal suspend fun trackMoodLoggedWithinGate() =
            withContext(Dispatchers.IO) {
                trackWithoutGate(AnalyticsEvents.MOOD_LOGGED, emptyMap())
            }

        private suspend fun trackWithoutGate(
            eventType: String,
            meta: Map<String, String>,
        ) {
            val safeMeta = sanitizeAnalyticsMeta(eventType, meta)
            logFirebaseEvent(eventType, safeMeta)
            // Pin the event to its owner before the first attempt. An app JWT
            // refresh must not silently reattribute an old owner's event.
            val ownerId =
                preferencesRepository.current().userId?.takeIf { it.isNotBlank() }
                    ?: return
            val eventId = UUID.randomUUID().toString()
            try {
                val response =
                    api.trackEvent(
                        TrackEventRequest(
                            eventType = eventType,
                            meta = safeMeta,
                            eventId = eventId,
                            ownerUserId = ownerId,
                        ),
                    )
                when (classifyAnalyticsResponse(response.code())) {
                    AnalyticsDeliveryDisposition.DELIVERED -> Unit
                    AnalyticsDeliveryDisposition.PERMANENT_FAILURE ->
                        Timber.w(
                            "Dropping permanently rejected analytics event: %s (%d)",
                            eventType,
                            response.code(),
                        )
                    AnalyticsDeliveryDisposition.RETRY -> queueEvent(eventType, safeMeta, eventId, ownerId)
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: IOException) {
                Timber.w(exception, "Queueing analytics event after transient failure: %s", eventType)
                queueEvent(eventType, safeMeta, eventId, ownerId)
            }
        }

        private suspend fun <T> withMoodGate(
            eventType: String,
            block: suspend () -> T,
        ): T =
            if (eventType == AnalyticsEvents.MOOD_LOGGED) {
                syncGate.withLock(block)
            } else {
                block()
            }

        private fun logFirebaseEvent(
            eventType: String,
            meta: Map<String, String>,
        ) {
            firebaseAnalytics.logEvent(
                eventType,
                Bundle().apply {
                    meta.forEach { (key, value) -> putString(key, value) }
                },
            )
        }

        private suspend fun queueEvent(
            eventType: String,
            meta: Map<String, String>,
            eventId: String = UUID.randomUUID().toString(),
            ownerUserId: String,
        ) {
            val createdAt = System.currentTimeMillis()
            queuedEventDao.enqueueBounded(
                entity =
                    QueuedEventEntity(
                        id = eventId,
                        type = eventType,
                        payload = json.encodeToString(MapSerializer(String.serializer(), String.serializer()), meta),
                        createdAt = createdAt,
                        ownerUserId = ownerUserId,
                    ),
                maxSize = MAX_QUEUED_EVENTS,
                minCreatedAt = createdAt - ANALYTICS_EVENT_RETENTION_MILLIS,
            )
        }

        private companion object {
            const val MAX_QUEUED_EVENTS = 500
        }
    }
