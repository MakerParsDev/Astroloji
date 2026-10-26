package com.parsfilo.astrology.core.ads

import android.app.Activity
import android.content.Context
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
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
        private var rewardedInterstitialAd: RewardedInterstitialAd? = null

        fun preload() {
            if (isLoading || rewardedInterstitialAd != null || !consentManager.canRequestAds) return
            isLoading = true
            RewardedInterstitialAd.load(
                context,
                AdMobUnits.rewardedInterstitial,
                AdRequest.Builder().build(),
                object : RewardedInterstitialAdLoadCallback() {
                    override fun onAdLoaded(ad: RewardedInterstitialAd) {
                        rewardedInterstitialAd = ad
                        isLoading = false
                        Timber.d("Rewarded interstitial ad loaded")
                    }

                    override fun onAdFailedToLoad(error: LoadAdError) {
                        rewardedInterstitialAd = null
                        isLoading = false
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
            // Consent may be revoked while a previously loaded ad is cached.
            val consentAllowed = consentManager.canRequestAds
            val ad =
                rewardedInterstitialAd.takeIf { consentAllowed } ?: run {
                    if (!consentAllowed) rewardedInterstitialAd = null
                    preload()
                    return false
                }
            rewardedInterstitialAd = null
            val finished = AtomicBoolean(false)
            val rewardLogged = AtomicBoolean(false)
            val impressionRecorded = AtomicBoolean(false)
            val dismissOnce = {
                if (finished.compareAndSet(false, true)) {
                    preload()
                    onDismissed()
                }
            }
            ad.fullScreenContentCallback =
                object : FullScreenContentCallback() {
                    override fun onAdDismissedFullScreenContent() {
                        dismissOnce()
                    }

                    override fun onAdFailedToShowFullScreenContent(error: com.google.android.gms.ads.AdError) {
                        Timber.w("Rewarded interstitial show failed: %s", error.message)
                        dismissOnce()
                    }

                    override fun onAdImpression() {
                        if (finished.get() || !impressionRecorded.compareAndSet(false, true)) return
                        scope.launch {
                            analyticsRepository.track(
                                AnalyticsEvents.AD_SHOWN,
                                mapOf("format" to "rewarded_interstitial", "placement" to placement),
                            )
                        }
                    }
                }
            return try {
                ad.show(activity) { rewardItem ->
                    // This unused format does not grant entitlements. Avoid
                    // misleading duplicate/late SDK reward event logging.
                    if (!finished.get() && rewardLogged.compareAndSet(false, true)) {
                        Timber.d("Rewarded interstitial reward earned: %s %s", rewardItem.amount, rewardItem.type)
                    }
                }
                true
            } catch (e: IllegalStateException) {
                Timber.w(e, "Rewarded interstitial SDK show threw")
                dismissOnce()
                false
            }
        }
    }
