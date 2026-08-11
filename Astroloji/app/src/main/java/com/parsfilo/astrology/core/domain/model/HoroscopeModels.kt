package com.parsfilo.astrology.core.domain.model

data class DailyHoroscope(
    val date: String,
    val sign: String,
    val language: String,
    val short: String,
    val full: String?,
    val love: String?,
    val career: String?,
    val money: String?,
    val health: String?,
    val dailyTip: String?,
    val luckyNumber: Int,
    val luckyColor: String,
    val energy: Int,
    val loveScore: Int,
    val careerScore: Int,
    val moneyScore: Int,
    val healthScore: Int,
)

data class WeeklyHoroscope(
    val week: String,
    val weekStart: String,
    val weekEnd: String,
    val sign: String,
    val language: String,
    val summary: String?,
    val love: String?,
    val career: String?,
    val money: String?,
    val bestDay: String?,
    val warning: String?,
)

data class MonthlyHoroscope(
    val month: String,
    val monthStart: String?,
    val monthEnd: String?,
    val sign: String,
    val language: String,
    val summary: String?,
    val love: String?,
    val career: String?,
    val money: String?,
    val bestDay: String?,
    val warning: String?,
)

data class CompatibilityReport(
    val sign1: String,
    val sign2: String,
    val language: String,
    val overallScore: Int,
    val loveScore: Int?,
    val friendshipScore: Int?,
    val workScore: Int?,
    val summary: String,
    val strengths: List<String>,
    val challenges: List<String>,
    val advice: String?,
    val famousCouples: List<String>,
)

data class PersonalityReport(
    val sign: String,
    val language: String,
    val summary: String,
    val deepAnalysis: String?,
    val strengths: List<String>,
    val weaknesses: List<String>,
    val idealPartners: List<String>,
    val careerFit: List<String>,
    val element: String,
    val planet: String,
    val color: String,
    val stone: String,
)

data class SubscriptionStatus(
    val isPremium: Boolean,
    val premiumExpiresAt: Long?,
    val productId: String,
)

object RemoteFlagDefaults {
    const val INTERSTITIAL_FREQUENCY = 5L
    const val INTERSTITIAL_DAILY_LIMIT = 1L
    const val INTERSTITIAL_COOLDOWN_MINUTES = 30L
    const val APP_OPEN_MIN_BACKGROUND_MS = 14_400_000L
}

data class RemoteFlags(
    val showPremiumBanner: Boolean = true,
    val showBannerAds: Boolean = true,
    val interstitialFrequency: Int = RemoteFlagDefaults.INTERSTITIAL_FREQUENCY.toInt(),
    val interstitialDailyLimit: Int = RemoteFlagDefaults.INTERSTITIAL_DAILY_LIMIT.toInt(),
    val interstitialCooldownMinutes: Int = RemoteFlagDefaults.INTERSTITIAL_COOLDOWN_MINUTES.toInt(),
    val rewardedDailyUnlockLimit: Int = 1,
    val premiumTrialDays: Int = 0,
    val appOpenMinBackgroundMs: Long = RemoteFlagDefaults.APP_OPEN_MIN_BACKGROUND_MS,
    val forceUpdateVersion: Long = 0,
    val onboardingPaywallEnabled: Boolean = false,
    val paywallVariant: String = "default",
    val creditPackVisibility: Boolean = true,
)
