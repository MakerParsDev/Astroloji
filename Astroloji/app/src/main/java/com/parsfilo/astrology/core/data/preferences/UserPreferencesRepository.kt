package com.parsfilo.astrology.core.data.preferences

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import com.parsfilo.astrology.core.domain.model.UserPreferences
import com.parsfilo.astrology.core.util.TimeUtils
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

object PreferencesKeys {
    val ONBOARDING_COMPLETED = booleanPreferencesKey("onboarding_completed")
    val SELECTED_SIGN = stringPreferencesKey("selected_sign")
    val LANGUAGE = stringPreferencesKey("language")
    val THEME = stringPreferencesKey("theme")
    val NOTIFICATION_ENABLED = booleanPreferencesKey("notification_enabled")
    val NOTIFICATION_HOUR = intPreferencesKey("notification_hour")
    val UTC_OFFSET = intPreferencesKey("utc_offset")
    val JWT = stringPreferencesKey("jwt")
    val USER_ID = stringPreferencesKey("user_id")
    val IS_PREMIUM = booleanPreferencesKey("is_premium")
    val SUBSCRIPTION_STATE = stringPreferencesKey("subscription_state")
    val PREMIUM_EXPIRES_AT = longPreferencesKey("premium_expires_at")
    val APP_OPEN_COUNT = intPreferencesKey("app_open_count")
    val LAST_STREAK_DATE = stringPreferencesKey("last_streak_date")
    val STREAK_COUNT = intPreferencesKey("streak_count")
    val LAST_INTERSTITIAL_SHOWN = longPreferencesKey("last_interstitial_shown")
    val INTERSTITIAL_COUNT_TODAY = intPreferencesKey("interstitial_count_today")
    val INTERSTITIAL_COUNT_DATE = stringPreferencesKey("interstitial_count_date")
    val CONSENT_STATUS = intPreferencesKey("consent_status")
}

@Singleton
class UserPreferencesRepository
    @Inject
    constructor(
        @ApplicationContext context: Context,
    ) {
        private val dataStore = context.userPreferencesDataStore

        val preferences: Flow<UserPreferences> = dataStore.data.map(::mapPreferences)

        fun emptyPreferences(): UserPreferences =
            UserPreferences(
                language = TimeUtils.defaultLanguageTag(),
                theme = "dark",
                utcOffset = TimeUtils.utcOffsetHours(),
            )

        suspend fun current(): UserPreferences = preferences.first()

        suspend fun updateOnboarding(
            completed: Boolean,
            sign: String,
            language: String,
        ) {
            dataStore.edit {
                it[PreferencesKeys.ONBOARDING_COMPLETED] = completed
                it[PreferencesKeys.SELECTED_SIGN] = sign
                it[PreferencesKeys.LANGUAGE] = language
            }
        }

        suspend fun updateSession(
            userId: String,
            jwt: String,
            isPremium: Boolean,
            premiumExpiresAt: Long?,
            sign: String,
            language: String,
            utcOffset: Int,
            notificationEnabled: Boolean,
            notificationHour: Int,
            subscriptionState: String = "none",
        ) {
            dataStore.edit {
                it[PreferencesKeys.USER_ID] = userId
                it[PreferencesKeys.JWT] = jwt
                it[PreferencesKeys.IS_PREMIUM] = isPremium
                it[PreferencesKeys.SUBSCRIPTION_STATE] = subscriptionState
                if (premiumExpiresAt != null) {
                    it[PreferencesKeys.PREMIUM_EXPIRES_AT] = premiumExpiresAt
                } else {
                    it.remove(PreferencesKeys.PREMIUM_EXPIRES_AT)
                }
                it[PreferencesKeys.SELECTED_SIGN] = sign
                it[PreferencesKeys.LANGUAGE] = language
                it[PreferencesKeys.UTC_OFFSET] = utcOffset
                it[PreferencesKeys.NOTIFICATION_ENABLED] = notificationEnabled
                it[PreferencesKeys.NOTIFICATION_HOUR] = notificationHour
            }
        }

        suspend fun updateLanguage(language: String) {
            dataStore.edit { it[PreferencesKeys.LANGUAGE] = language }
        }

        suspend fun updateTheme(theme: String) {
            dataStore.edit { it[PreferencesKeys.THEME] = theme }
        }

        suspend fun updateNotification(
            enabled: Boolean,
            hour: Int,
        ) {
            dataStore.edit {
                it[PreferencesKeys.NOTIFICATION_ENABLED] = enabled
                it[PreferencesKeys.NOTIFICATION_HOUR] = hour
            }
        }

        suspend fun updateInterstitialTimestamp(timestamp: Long) {
            dataStore.edit { it[PreferencesKeys.LAST_INTERSTITIAL_SHOWN] = timestamp }
        }

        suspend fun updateInterstitialMetrics(
            lastShown: Long,
            count: Int,
            date: String,
        ) {
            dataStore.edit {
                it[PreferencesKeys.LAST_INTERSTITIAL_SHOWN] = lastShown
                it[PreferencesKeys.INTERSTITIAL_COUNT_TODAY] = count
                it[PreferencesKeys.INTERSTITIAL_COUNT_DATE] = date
            }
        }

        suspend fun updateConsentStatus(status: Int) {
            dataStore.edit { it[PreferencesKeys.CONSENT_STATUS] = status }
        }

        suspend fun updateStreak(
            lastDate: String,
            count: Int,
        ) {
            dataStore.edit {
                it[PreferencesKeys.LAST_STREAK_DATE] = lastDate
                it[PreferencesKeys.STREAK_COUNT] = count
            }
        }

        suspend fun incrementAppOpenCount() {
            dataStore.edit {
                val current = it[PreferencesKeys.APP_OPEN_COUNT] ?: 0
                it[PreferencesKeys.APP_OPEN_COUNT] = current + 1
            }
        }

        suspend fun clearJwt() {
            dataStore.edit { it.remove(PreferencesKeys.JWT) }
        }

        suspend fun clearSession() {
            dataStore.edit {
                it.remove(PreferencesKeys.JWT)
                it.remove(PreferencesKeys.USER_ID)
                it.remove(PreferencesKeys.IS_PREMIUM)
                it.remove(PreferencesKeys.SUBSCRIPTION_STATE)
                it.remove(PreferencesKeys.PREMIUM_EXPIRES_AT)
                it.removeLegacyFallbackCredentials()
            }
        }

        suspend fun clearAll() {
            dataStore.edit { it.clear() }
        }

        suspend fun getJwt(): String? = current().jwt

        private fun mapPreferences(preferences: Preferences): UserPreferences =
            UserPreferences(
                onboardingCompleted = preferences[PreferencesKeys.ONBOARDING_COMPLETED] ?: false,
                selectedSign = preferences[PreferencesKeys.SELECTED_SIGN] ?: "aries",
                language = preferences[PreferencesKeys.LANGUAGE] ?: TimeUtils.defaultLanguageTag(),
                theme = preferences[PreferencesKeys.THEME] ?: "dark",
                notificationEnabled = preferences[PreferencesKeys.NOTIFICATION_ENABLED] ?: true,
                notificationHour = preferences[PreferencesKeys.NOTIFICATION_HOUR] ?: 9,
                utcOffset = preferences[PreferencesKeys.UTC_OFFSET] ?: TimeUtils.utcOffsetHours(),
                jwt = preferences[PreferencesKeys.JWT],
                userId = preferences[PreferencesKeys.USER_ID],
                isPremium = preferences[PreferencesKeys.IS_PREMIUM] ?: false,
                subscriptionState = preferences[PreferencesKeys.SUBSCRIPTION_STATE] ?: "none",
                premiumExpiresAt = preferences[PreferencesKeys.PREMIUM_EXPIRES_AT],
                appOpenCount = preferences[PreferencesKeys.APP_OPEN_COUNT] ?: 0,
                lastStreakDate = preferences[PreferencesKeys.LAST_STREAK_DATE],
                streakCount = preferences[PreferencesKeys.STREAK_COUNT] ?: 0,
                lastInterstitialShown = preferences[PreferencesKeys.LAST_INTERSTITIAL_SHOWN] ?: 0L,
                interstitialCountToday = preferences[PreferencesKeys.INTERSTITIAL_COUNT_TODAY] ?: 0,
                interstitialCountDate = preferences[PreferencesKeys.INTERSTITIAL_COUNT_DATE],
                consentStatus = preferences[PreferencesKeys.CONSENT_STATUS] ?: 0,
            )
    }
