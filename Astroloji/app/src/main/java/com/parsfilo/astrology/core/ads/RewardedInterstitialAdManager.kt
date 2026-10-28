package com.parsfilo.astrology.core.ads

import android.app.Activity
import android.content.Context
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.rewarded.RewardItem
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAd
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAdLoadCallback
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import timber.log.Timber
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RewardedInterstitialAdManager
    @Inject
    constructor(
        @param:ApplicationContext private val context: Context,
        private val consentManager: GoogleMobileAdsConsentManager,
        private val analyticsRepository: AnalyticsRepository,
    ) {
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        private var isLoading = false
        private val loadRetryGate = AdLoadRetryGate()
        private var rewardedInterstitialAd: RewardedInterstitialAd? = null
        private var loadedConsentRevision = Long.MIN_VALUE

        private fun discardAdFromEarlierConsentRevision() {
            if (loadedConsentRevision == consentManager.consentRevision) return
            rewardedInterstitialAd = null
        }

        fun preload() {
            discardAdFromEarlierConsentRevision()
            val loadRevision = consentManager.consentRevision
            if (isLoading || rewardedInterstitialAd != null || !consentManager.canRequestAds) return
            if (!loadRetryGate.canLoad()) return
            isLoading = true
            RewardedInterstitialAd.load(
                context,
                AdMobUnits.rewardedInterstitial,
                AdRequest.Builder().build(),
                object : RewardedInterstitialAdLoadCallback() {
                    override fun onAdLoaded(ad: RewardedInterstitialAd) {
                        isLoading = false
                        // Never cache a callback that arrived after permission was revoked.
                        if (!consentManager.canRequestAds || consentManager.consentRevision != loadRevision) {
                            rewardedInterstitialAd = null
                            // A stale creative is not usable under the updated UMP decision.
                            if (consentManager.canRequestAds) preload()
                            return
                        }
                        rewardedInterstitialAd = ad
                        loadedConsentRevision = loadRevision
                        loadRetryGate.recordSuccess()
                        Timber.d("Rewarded interstitial ad loaded")
                    }

                    override fun onAdFailedToLoad(error: LoadAdError) {
                        rewardedInterstitialAd = null
                        isLoading = false
                        if (consentManager.consentRevision != loadRevision) {
                            // Do not penalize current consent for an old load's failure.
                            if (consentManager.canRequestAds) preload()
                            return
                        }
                        loadRetryGate.recordFailure()
                        Timber.w("Rewarded interstitial ad failed: %s", error.message)
                    }
                },
            )
        }

        fun showIfAvailable(
            activity: Activity,
            placement: String,
            onDismissed: () -> Unit = {},
        ): Boolean {
            discardAdFromEarlierConsentRevision()
            // Consent may be revoked while a previously loaded ad is cached.
            val consentAllowed = consentManager.canRequestAds
            val ad =
                rewardedInterstitialAd.takeIf { consentAllowed } ?: run {
                    if (!consentAllowed) rewardedInterstitialAd = null
                    preload()
                    return false
                }
            rewardedInterstitialAd = null
            val session =
                RewardedInterstitialSession(
                    placement = placement,
                    scope = scope,
                    analyticsRepository = analyticsRepository,
                    onFinished = {
                        preload()
                        onDismissed()
                    },
                )
            ad.fullScreenContentCallback = session

            return try {
                ad.show(activity, session::onRewardEarned)
                true
            } catch (error: IllegalStateException) {
                Timber.w(error, "Rewarded interstitial SDK show threw")
                // If an SDK callback already notified the host, it owns the
                // navigation. Otherwise the caller owns the false fallback.
                val callbackAlreadyHandled = !session.markFinished()
                if (!callbackAlreadyHandled) preload()
                callbackAlreadyHandled
            }
        }
    }

/**
 * The SDK can emit terminal/impression callbacks multiple times, including after
 * an exception in show(). Keep one per-presentation state, independent of manager preload.
 */
private class RewardedInterstitialSession(
    private val placement: String,
    private val scope: CoroutineScope,
    private val analyticsRepository: AnalyticsRepository,
    private val onFinished: () -> Unit,
) : FullScreenContentCallback() {
    private val terminated = AtomicBoolean(false)
    private val impressionSent = AtomicBoolean(false)
    private val rewardLogged = AtomicBoolean(false)

    /** Returns false if a terminal callback already completed this presentation. */
    fun markFinished(): Boolean = terminated.compareAndSet(false, true)

    private fun notifyFinished() {
        if (markFinished()) onFinished()
    }

    override fun onAdDismissedFullScreenContent() {
        notifyFinished()
    }

    override fun onAdFailedToShowFullScreenContent(error: AdError) {
        Timber.w("Rewarded interstitial show failed: %s", error.message)
        notifyFinished()
    }

    override fun onAdImpression() {
        if (terminated.get() || !impressionSent.compareAndSet(false, true)) return
        scope.launch {
            analyticsRepository.track(
                AnalyticsEvents.AD_SHOWN,
                mapOf("format" to "rewarded_interstitial", "placement" to placement),
            )
        }
    }

    fun onRewardEarned(rewardItem: RewardItem) {
        // The dormant format does not grant entitlements.
        if (terminated.get() || !rewardLogged.compareAndSet(false, true)) return
        Timber.d("Rewarded interstitial reward earned: %s %s", rewardItem.amount, rewardItem.type)
    }
}
