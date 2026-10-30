package com.parsfilo.astrology

import android.content.Intent
import android.os.Bundle
import android.os.SystemClock
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.view.WindowCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import com.parsfilo.astrology.core.ads.AdConsentSnapshot
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
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.drop
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
            SideEffect {
                // Edge-to-edge initializes system bars from the OS theme. The app can use
                // a different theme and change it without restarting the Activity.
                val controller = WindowCompat.getInsetsController(window, window.decorView)
                controller.isAppearanceLightStatusBars = shouldUseDarkStatusBarIcons(darkTheme)
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
            // A slow Remote Config network fetch must not delay UMP consent.
            // Consent and ad eligibility are checked before preloading anything.
            val flags =
                prepareStartupWithConsentFirst(
                    gatherConsent = { consentManager.gatherConsent(this@MainActivity) },
                    persistConsent = { preferencesRepository.updateConsentStatus(consentManager.consentStatus) },
                    initializeAds = { adsInitializer.initializeIfNeeded() },
                    preloadAds = { preloadAdStack() },
                    fetchRemoteConfig = { remoteConfigRepository.fetchFlags() },
                )
            appOpenMinBackgroundDurationMs = flags.appOpenMinBackgroundMs
            // Consent may be granted later in Settings without recreating this
            // activity. Reinitialize/preload only after startup config is ready.
            observeConsentChangesAfterStartup(
                snapshots = consentManager.consentSnapshotFlow,
                onConsentChanged = { preferencesRepository.updateConsentStatus(consentManager.consentStatus) },
                reloadAllowedAds = {
                    adsInitializer.initializeIfNeeded()
                    preloadAdStack()
                },
            )
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

/**
 * Startup handles the current UMP decision. Subsequent decisions can change
 * consent inside Settings, without an Activity restart. Never load on denial.
 */
internal suspend fun observeConsentChangesAfterStartup(
    snapshots: StateFlow<AdConsentSnapshot>,
    onConsentChanged: suspend () -> Unit,
    reloadAllowedAds: suspend () -> Unit,
) {
    snapshots.drop(1).collect { snapshot ->
        onConsentChanged()
        if (snapshot.canRequestAds) reloadAllowedAds()
    }
}

/**
 * A slow Remote Config request must not delay UMP consent presentation.
 * Keep ad initialization/preloading after config to respect the active policy.
 */
internal suspend fun <T> prepareStartupWithConsentFirst(
    gatherConsent: suspend () -> Unit,
    persistConsent: suspend () -> Unit,
    initializeAds: suspend () -> Unit,
    preloadAds: suspend () -> Unit,
    fetchRemoteConfig: suspend () -> T,
): T {
    gatherConsent()
    persistConsent()
    val flags = fetchRemoteConfig()
    initializeAds()
    preloadAds()
    return flags
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

// #161: Keep app-open disabled until a real loading-screen-only flow exists.
// A 4h warm-resume gate cannot reuse a 4h-old cached ad; do not issue dead preloads.
private const val APP_OPEN_DELIVERY_ENABLED = false

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
        preloadAppOpen = !policy.isPremium && APP_OPEN_DELIVERY_ENABLED,
        preloadInterstitial = !policy.isPremium,
        preloadRewarded = !policy.isPremium && policy.canShowRewarded,
        preloadRewardedInterstitial = false,
        preloadNative = false, // No screen currently consumes a NativeAd.
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
): Boolean = APP_OPEN_DELIVERY_ENABLED && isAppOpenSessionEligible(policy)

internal fun isAppOpenSessionEligible(
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
