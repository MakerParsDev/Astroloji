package com.parsfilo.astrology.core.data.repository

import com.google.firebase.remoteconfig.FirebaseRemoteConfig
import com.google.firebase.remoteconfig.FirebaseRemoteConfigSettings
import com.parsfilo.astrology.core.domain.model.RemoteFlagDefaults
import com.parsfilo.astrology.core.domain.model.RemoteFlags
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

object RemoteConfigDefaults {
    const val INTERSTITIAL_FREQUENCY = RemoteFlagDefaults.INTERSTITIAL_FREQUENCY
    const val INTERSTITIAL_DAILY_LIMIT = RemoteFlagDefaults.INTERSTITIAL_DAILY_LIMIT
    const val INTERSTITIAL_COOLDOWN_MINUTES = RemoteFlagDefaults.INTERSTITIAL_COOLDOWN_MINUTES
    const val APP_OPEN_MIN_BACKGROUND_MS = RemoteFlagDefaults.APP_OPEN_MIN_BACKGROUND_MS
}

object RemoteConfigKeys {
    const val SHOW_PREMIUM_BANNER = "show_premium_banner"
    const val SHOW_BANNER_ADS = "show_banner_ads"
    const val INTERSTITIAL_FREQUENCY = "interstitial_frequency"
    const val INTERSTITIAL_DAILY_LIMIT = "interstitial_daily_limit"
    const val INTERSTITIAL_COOLDOWN_MINUTES = "interstitial_cooldown_minutes"
    const val PREMIUM_TRIAL_DAYS = "premium_trial_days"
    const val REWARDED_DAILY_UNLOCK_LIMIT = "rewarded_daily_unlock_limit"
    const val APP_OPEN_MIN_BACKGROUND_MS = "app_open_min_background_ms"
    const val FORCE_UPDATE_VERSION = "force_update_version"
    const val ONBOARDING_PAYWALL_ENABLED = "onboarding_paywall_enabled"
    const val PAYWALL_VARIANT = "paywall_variant"
}

@Singleton
class RemoteConfigRepository
    @Inject
    constructor(
        private val remoteConfig: FirebaseRemoteConfig,
    ) {
        suspend fun fetchFlags(): RemoteFlags =
            withContext(Dispatchers.IO) {
                remoteConfig
                    .setConfigSettingsAsync(
                        FirebaseRemoteConfigSettings
                            .Builder()
                            .setMinimumFetchIntervalInSeconds(3600)
                            .build(),
                    ).await()
                remoteConfig
                    .setDefaultsAsync(
                        mapOf(
                            RemoteConfigKeys.SHOW_PREMIUM_BANNER to true,
                            RemoteConfigKeys.SHOW_BANNER_ADS to true,
                            RemoteConfigKeys.INTERSTITIAL_FREQUENCY to RemoteConfigDefaults.INTERSTITIAL_FREQUENCY,
                            RemoteConfigKeys.INTERSTITIAL_DAILY_LIMIT to RemoteConfigDefaults.INTERSTITIAL_DAILY_LIMIT,
                            RemoteConfigKeys.INTERSTITIAL_COOLDOWN_MINUTES to
                                RemoteConfigDefaults.INTERSTITIAL_COOLDOWN_MINUTES,
                            RemoteConfigKeys.PREMIUM_TRIAL_DAYS to 0L,
                            RemoteConfigKeys.REWARDED_DAILY_UNLOCK_LIMIT to 1L,
                            RemoteConfigKeys.APP_OPEN_MIN_BACKGROUND_MS to
                                RemoteConfigDefaults.APP_OPEN_MIN_BACKGROUND_MS,
                            RemoteConfigKeys.FORCE_UPDATE_VERSION to 0L,
                            RemoteConfigKeys.ONBOARDING_PAYWALL_ENABLED to false,
                            RemoteConfigKeys.PAYWALL_VARIANT to "default",
                        ),
                    ).await()
                runCatching { remoteConfig.fetchAndActivate().await() }
                    .onFailure { Timber.w(it, "Remote Config fetch failed, continuing with cached/default flags.") }
                RemoteFlags(
                    showPremiumBanner = remoteConfig.getBoolean(RemoteConfigKeys.SHOW_PREMIUM_BANNER),
                    showBannerAds = remoteConfig.getBoolean(RemoteConfigKeys.SHOW_BANNER_ADS),
                    interstitialFrequency = remoteConfig.getLong(RemoteConfigKeys.INTERSTITIAL_FREQUENCY).toInt(),
                    interstitialDailyLimit = remoteConfig.getLong(RemoteConfigKeys.INTERSTITIAL_DAILY_LIMIT).toInt(),
                    interstitialCooldownMinutes = remoteConfig.getLong(RemoteConfigKeys.INTERSTITIAL_COOLDOWN_MINUTES).toInt(),
                    premiumTrialDays = remoteConfig.getLong(RemoteConfigKeys.PREMIUM_TRIAL_DAYS).toInt(),
                    rewardedDailyUnlockLimit = remoteConfig.getLong(RemoteConfigKeys.REWARDED_DAILY_UNLOCK_LIMIT).toInt(),
                    appOpenMinBackgroundMs = remoteConfig.getLong(RemoteConfigKeys.APP_OPEN_MIN_BACKGROUND_MS),
                    forceUpdateVersion = remoteConfig.getLong(RemoteConfigKeys.FORCE_UPDATE_VERSION),
                    onboardingPaywallEnabled = remoteConfig.getBoolean(RemoteConfigKeys.ONBOARDING_PAYWALL_ENABLED),
                    paywallVariant = remoteConfig.getString(RemoteConfigKeys.PAYWALL_VARIANT),
                )
            }
    }
