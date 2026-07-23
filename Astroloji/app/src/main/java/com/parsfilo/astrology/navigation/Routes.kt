package com.parsfilo.astrology.navigation

import kotlinx.serialization.Serializable

@Serializable object OnboardingRoute

@Serializable object HomeRoute

@Serializable object CompatibilityRoute

@Serializable object SettingsRoute

@Serializable object PremiumRoute

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
