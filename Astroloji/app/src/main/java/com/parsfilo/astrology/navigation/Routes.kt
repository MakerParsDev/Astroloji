package com.parsfilo.astrology.navigation

import androidx.annotation.Keep
import kotlinx.serialization.Serializable

@Serializable object OnboardingRoute

@Serializable object HomeRoute

@Serializable object CompatibilityRoute

@Serializable object SettingsRoute

@Serializable object PersonalGuidanceRoute

@Keep
@Serializable
enum class PaywallSource(
    val analyticsValue: String,
) {
    NAV("nav"),
    DAILY_LOCK("daily_lock"),
    WEEKLY_LOCK("weekly_lock"),
    MONTHLY_LOCK("monthly_lock"),
    COMPATIBILITY_LOCK("compat_lock"),
    PERSONALITY_LOCK("personality_lock"),
    PROFILE_UPGRADE("profile_upgrade"),
}

@Serializable
data class PremiumRoute(
    val source: PaywallSource = PaywallSource.NAV,
)

@Serializable data class DailyDetailRoute(
    val sign: String,
)

@Serializable data class WeeklyRoute(
    val sign: String,
)

@Serializable data class MonthlyRoute(
    val sign: String,
)

@Serializable data class PersonalityRoute(
    val sign: String,
)

@Serializable data class CompatibilityResultRoute(
    val sign1: String,
    val sign2: String,
)

enum class BottomDestination {
    HOME,
    COMPATIBILITY,
    SETTINGS,
    PREMIUM,
}
