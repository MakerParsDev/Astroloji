package com.parsfilo.astrology

import android.content.Intent
import android.os.Bundle
import android.os.SystemClock
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import com.parsfilo.astrology.core.ads.AdEligibilityChecker
import com.parsfilo.astrology.core.ads.AdsInitializer
import com.parsfilo.astrology.core.ads.AppOpenAdManager
import com.parsfilo.astrology.core.ads.GoogleMobileAdsConsentManager
import com.parsfilo.astrology.core.ads.InterstitialAdManager
import com.parsfilo.astrology.core.ads.NativeAdvancedAdManager
import com.parsfilo.astrology.core.ads.RewardedAdManager
import com.parsfilo.astrology.core.ads.RewardedInterstitialAdManager
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.RemoteConfigDefaults
import com.parsfilo.astrology.core.data.repository.RemoteConfigRepository
import com.parsfilo.astrology.core.util.ZodiacSign
import com.parsfilo.astrology.navigation.AppDeepLink
import com.parsfilo.astrology.navigation.AstrologyAppRoot
import com.parsfilo.astrology.navigation.parseAppDeepLink
import com.parsfilo.astrology.ui.theme.AstrolojiTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : AppCompatActivity() {
    @Inject
    lateinit var preferencesRepository: UserPreferencesRepository

    @Inject
    lateinit var remoteConfigRepository: RemoteConfigRepository

    @Inject
    lateinit var consentManager: GoogleMobileAdsConsentManager

    @Inject
    lateinit var adEligibilityChecker: AdEligibilityChecker

    @Inject
    lateinit var adsInitializer: AdsInitializer

    @Inject
    lateinit var appOpenAdManager: AppOpenAdManager

    @Inject
    lateinit var interstitialAdManager: InterstitialAdManager

    @Inject
    lateinit var rewardedAdManager: RewardedAdManager

    @Inject
    lateinit var rewardedInterstitialAdManager: RewardedInterstitialAdManager

    @Inject
    lateinit var nativeAdvancedAdManager: NativeAdvancedAdManager

    private var skipNextAppOpen = true
    private var lastStoppedAtMs = 0L
    private var appOpenMinBackgroundDurationMs = RemoteConfigDefaults.APP_OPEN_MIN_BACKGROUND_MS
    private var appOpenCount = 0
    private var pendingDeepLink by mutableStateOf<AppDeepLink?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingDeepLink = intent.toAppDeepLink()
        enableEdgeToEdge()
        launchStartupWork()
        setContent {
            val preferences =
                preferencesRepository.preferences
                    .collectAsStateWithLifecycle(
                        initialValue = preferencesRepository.emptyPreferences(),
                    ).value
            val darkTheme =
                when (preferences.theme) {
                    "light" -> false
                    "system" -> isSystemInDarkTheme()
                    else -> true
                }
            AstrolojiTheme(darkTheme = darkTheme) {
                AstrologyAppRoot(
                    deepLink = pendingDeepLink,
                    onDeepLinkConsumed = { pendingDeepLink = null },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pendingDeepLink = intent.toAppDeepLink()
    }

    private fun launchStartupWork() {
        if (BuildConfig.STORE_SCREENSHOT_QA) return
        lifecycleScope.launch {
            val preferences = preferencesRepository.current()
            appOpenCount =
                resolveNextAppOpenCount(
                    onboardingCompleted = preferences.onboardingCompleted,
                    persistedCount = preferences.appOpenCount,
                )
            if (appOpenCount > 0) {
                preferencesRepository.incrementAppOpenCount()
            }
            val flags = remoteConfigRepository.fetchFlags()
            appOpenMinBackgroundDurationMs = flags.appOpenMinBackgroundMs
            consentManager.gatherConsent(this@MainActivity)
            preferencesRepository.updateConsentStatus(consentManager.consentStatus)
            adsInitializer.initializeIfNeeded()
            preloadAdStack()
        }
    }

    override fun onStart() {
        super.onStart()
        lifecycleScope.launch {
            val preferences = preferencesRepository.current()
            val shouldShowAppOpen =
                if (BuildConfig.STORE_SCREENSHOT_QA) {
                    false
                } else {
                    shouldShowAppOpenAd(
                        AppOpenAdPolicy(
                            isDebug = BuildConfig.DEBUG,
                            onboardingCompleted = preferences.onboardingCompleted,
                            isPremium = preferences.isPremium,
                            canRequestAds = consentManager.canRequestAds,
                            skipNextAppOpen = skipNextAppOpen,
                            lastStoppedAtMs = lastStoppedAtMs,
                            nowMs = SystemClock.elapsedRealtime(),
                            appOpenCount = appOpenCount,
                            minBackgroundDurationMs = appOpenMinBackgroundDurationMs,
                        ),
                    )
                }
            if (skipNextAppOpen) {
                skipNextAppOpen = false
            }
            if (shouldShowAppOpen) {
                appOpenAdManager.showIfAvailable(this@MainActivity)
            }
        }
    }

    override fun onStop() {
        super.onStop()
        lastStoppedAtMs = SystemClock.elapsedRealtime()
    }

    private suspend fun preloadAdStack() {
        val preferences = preferencesRepository.current()
        val preloadPlan =
            resolveAdPreloadPlan(
                AdPreloadPolicy(
                    isPremium = preferences.isPremium,
                    canShowRewarded = adEligibilityChecker.canShowRewarded(),
                ),
            )
        if (preloadPlan.preloadAppOpen) {
            appOpenAdManager.preload()
        }
        if (preloadPlan.preloadInterstitial) {
            interstitialAdManager.preload()
        }
        if (preloadPlan.preloadRewarded) {
            rewardedAdManager.preload()
        }
        if (preloadPlan.preloadRewardedInterstitial) {
            rewardedInterstitialAdManager.preload()
        }
        if (preloadPlan.preloadNative) {
            nativeAdvancedAdManager.preload()
        }
    }
}

private fun Intent?.toAppDeepLink(): AppDeepLink? {
    val intent = this ?: return null
    val typeFromExtras = intent.getStringExtra("deeplink_type")
    val signFromExtras =
        intent
            .getStringExtra("deeplink_sign")
            ?.trim()
            ?.lowercase()
            ?.let(ZodiacSign::fromKeyOrNull)
            ?.key
    if (typeFromExtras == "daily" && signFromExtras != null) {
        return AppDeepLink(type = "daily", sign = signFromExtras)
    }
    if (typeFromExtras == "transit") {
        return AppDeepLink(type = "personal_guidance")
    }
    return parseAppDeepLink(intent.data)
}

internal data class AdPreloadPolicy(
    val isPremium: Boolean,
    val canShowRewarded: Boolean,
)

internal data class AdPreloadPlan(
    val preloadAppOpen: Boolean,
    val preloadInterstitial: Boolean,
    val preloadRewarded: Boolean,
    val preloadRewardedInterstitial: Boolean,
    val preloadNative: Boolean,
)

internal fun resolveAdPreloadPlan(policy: AdPreloadPolicy): AdPreloadPlan =
    AdPreloadPlan(
        preloadAppOpen = !policy.isPremium,
        preloadInterstitial = !policy.isPremium,
        preloadRewarded = !policy.isPremium && policy.canShowRewarded,
        preloadRewardedInterstitial = false,
        preloadNative = !policy.isPremium,
    )

internal fun resolveNextAppOpenCount(
    onboardingCompleted: Boolean,
    persistedCount: Int,
): Int = if (onboardingCompleted) persistedCount + 1 else 0

internal data class AppOpenAdPolicy(
    val isDebug: Boolean,
    val onboardingCompleted: Boolean,
    val isPremium: Boolean,
    val canRequestAds: Boolean,
    val skipNextAppOpen: Boolean,
    val lastStoppedAtMs: Long,
    val nowMs: Long,
    val appOpenCount: Int,
    val minBackgroundDurationMs: Long = RemoteConfigDefaults.APP_OPEN_MIN_BACKGROUND_MS,
    val minimumAppOpenCount: Int = 4,
)

internal fun shouldShowAppOpenAd(
    policy: AppOpenAdPolicy,
): Boolean {
    val isEligibleSession =
        !policy.isDebug &&
            policy.onboardingCompleted &&
            !policy.isPremium &&
            policy.canRequestAds &&
            !policy.skipNextAppOpen &&
            policy.appOpenCount >= policy.minimumAppOpenCount
    val hasValidBackgroundTimestamp =
        policy.lastStoppedAtMs > 0L &&
            policy.nowMs > policy.lastStoppedAtMs
    val backgroundDurationMs = policy.nowMs - policy.lastStoppedAtMs
    return isEligibleSession &&
        hasValidBackgroundTimestamp &&
        backgroundDurationMs >= policy.minBackgroundDurationMs
}
