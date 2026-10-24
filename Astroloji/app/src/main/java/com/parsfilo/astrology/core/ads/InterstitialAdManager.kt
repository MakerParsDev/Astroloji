package com.parsfilo.astrology.core.ads

import android.app.Activity
import android.content.Context
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import timber.log.Timber
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class InterstitialAdManager
    @Inject
    constructor(
        @param:ApplicationContext private val context: Context,
        private val consentManager: GoogleMobileAdsConsentManager,
        private val analyticsRepository: AnalyticsRepository,
        private val adFrequencyManager: AdFrequencyManager,
    ) {
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        private var isLoading = false
        private val loadRetryGate = AdLoadRetryGate()
        private var interstitialAd: InterstitialAd? = null

        fun preload() {
            val canStartPreload = !isLoading && interstitialAd == null && consentManager.canRequestAds
            if (!canStartPreload || !loadRetryGate.canLoad()) return
            isLoading = true
            InterstitialAd.load(
                context,
                AdMobUnits.interstitial,
                AdRequest.Builder().build(),
                object : InterstitialAdLoadCallback() {
                    override fun onAdLoaded(ad: InterstitialAd) {
                        interstitialAd = ad
                        isLoading = false
                        loadRetryGate.recordSuccess()
                        Timber.d("Interstitial ad loaded")
                    }

                    override fun onAdFailedToLoad(error: LoadAdError) {
                        interstitialAd = null
                        isLoading = false
                        loadRetryGate.recordFailure()
                        Timber.w("Interstitial ad failed: %s", error.message)
                    }
                },
            )
        }

        fun showIfAvailable(
            activity: Activity,
            placement: String,
            onDismissed: () -> Unit = {},
        ): Boolean {
            // Consent may change after the interstitial was preloaded.
            val consentAllowed = consentManager.canRequestAds
            val ad =
                interstitialAd.takeIf { consentAllowed } ?: run {
                    if (!consentAllowed) interstitialAd = null
                    preload()
                    return false
                }
            interstitialAd = null
            ad.fullScreenContentCallback =
                object : FullScreenContentCallback() {
                    override fun onAdDismissedFullScreenContent() {
                        preload()
                        onDismissed()
                    }

                    override fun onAdFailedToShowFullScreenContent(error: com.google.android.gms.ads.AdError) {
                        Timber.w("Interstitial show failed: %s", error.message)
                        preload()
                        onDismissed()
                    }

                    override fun onAdImpression() {
                        // Start immediately, before dismiss/navigation can perform another
                        // eligibility check. The manager mutex holds until count persistence.
                        scope.launch(start = CoroutineStart.UNDISPATCHED) {
                            // Only a confirmed SDK impression consumes the daily cap/cooldown.
                            // A show() attempt can fail and must not consume the quota.
                            try {
                                adFrequencyManager.recordInterstitialShown()
                            } catch (e: IOException) {
                                Timber.w(e, "Failed to persist interstitial impression")
                            }
                            analyticsRepository.track(
                                AnalyticsEvents.AD_SHOWN,
                                mapOf("format" to "interstitial", "placement" to placement),
                            )
                        }
                    }
                }
            ad.show(activity)
            return true
        }
    }
