package com.parsfilo.astrology.core.ads

import com.parsfilo.astrology.BuildConfig

object AdMobUnits {
    val banner: String get() = BuildConfig.ADMOB_BANNER_ID
    val interstitial: String get() = BuildConfig.ADMOB_INTERSTITIAL_ID
    val rewarded: String get() = BuildConfig.ADMOB_REWARDED_ID
    val rewardedInterstitial: String get() = BuildConfig.ADMOB_REWARDED_INTERSTITIAL_ID
    val appOpen: String get() = BuildConfig.ADMOB_APP_OPEN_ID
    val nativeAdvanced: String get() = BuildConfig.ADMOB_NATIVE_ADVANCED_ID
}
