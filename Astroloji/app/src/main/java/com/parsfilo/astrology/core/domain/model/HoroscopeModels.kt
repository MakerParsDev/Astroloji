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

data class RemoteFlags(
    val showPremiumBanner: Boolean = true,
    val showBannerAds: Boolean = true,
    val interstitialFrequency: Int = 5,
    val interstitialDailyLimit: Int = 3,
    val interstitialCooldownMinutes: Int = 5,
    val rewardedDailyUnlockLimit: Int = 1,
    val premiumTrialDays: Int = 0,
    val appOpenMinBackgroundMs: Long = 15_000L,
    val forceUpdateVersion: Long = 0,
)
