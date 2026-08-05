package com.parsfilo.astrology.core.domain.model

data class UserProfile(
    val userId: String,
    val sign: String,
    val language: String,
    val isPremium: Boolean,
    val subscriptionState: String = "none",
    val premiumExpiresAt: Long?,
    val jwt: String,
    val utcOffset: Int,
    val notificationEnabled: Boolean,
    val notificationHour: Int,
)

data class UserPreferences(
    val onboardingCompleted: Boolean = false,
    val selectedSign: String = "aries",
    val language: String = "tr",
    val theme: String = "dark",
    val notificationEnabled: Boolean = true,
    val notificationHour: Int = 9,
    val utcOffset: Int = 3,
    val jwt: String? = null,
    val userId: String? = null,
    val isPremium: Boolean = false,
    val subscriptionState: String = "none",
    val premiumExpiresAt: Long? = null,
    val appOpenCount: Int = 0,
    val lastStreakDate: String? = null,
    val streakCount: Int = 0,
    val lastInterstitialShown: Long = 0L,
    val interstitialCountToday: Int = 0,
    val interstitialCountDate: String? = null,
    val lastDailyFeedbackDate: String? = null,
    val lastDailyFeedbackValue: String? = null,
    val consentStatus: Int = 0,
)
