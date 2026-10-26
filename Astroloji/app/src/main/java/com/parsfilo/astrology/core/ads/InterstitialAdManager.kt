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
import java.util.concurrent.atomic.AtomicBoolean
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
        private var loadedConsentRevision = Long.MIN_VALUE

        private fun discardAdFromEarlierConsentRevision() {
            if (loadedConsentRevision == consentManager.consentRevision) return
            interstitialAd = null
        }

        fun preload() {
            discardAdFromEarlierConsentRevision()
            val loadRevision = consentManager.consentRevision
            val canStartPreload = !isLoading && interstitialAd == null && consentManager.canRequestAds
            if (!canStartPreload || !loadRetryGate.canLoad()) return
            isLoading = true
            InterstitialAd.load(
                context,
                AdMobUnits.interstitial,
                AdRequest.Builder().build(),
                object : InterstitialAdLoadCallback() {
                    override fun onAdLoaded(ad: InterstitialAd) {
                        isLoading = false
                        // Discard an in-flight load if the consent state changed.
                        if (!consentManager.canRequestAds || consentManager.consentRevision != loadRevision) {
                            interstitialAd = null
                            return
                        }
                        interstitialAd = ad
                        loadedConsentRevision = loadRevision
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
            discardAdFromEarlierConsentRevision()
            // Consent may change after the interstitial was preloaded.
            val consentAllowed = consentManager.canRequestAds
            val ad =
                interstitialAd.takeIf { consentAllowed } ?: run {
                    if (!consentAllowed) interstitialAd = null
                    preload()
                    return false
                }
            interstitialAd = null
            val finished = AtomicBoolean(false)
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
                        Timber.w("Interstitial show failed: %s", error.message)
                        dismissOnce()
                    }

                    override fun onAdImpression() {
                        // Duplicate or late SDK callbacks must not consume additional
                        // quota or record fictitious impressions after failed display.
                        if (finished.get() || !impressionRecorded.compareAndSet(false, true)) return
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
            return try {
                ad.show(activity)
                true
            } catch (e: IllegalStateException) {
                // false means the caller navigates itself. Do not invoke
                // onDismissed too: Daily/Weekly/Monthly already navigate on false.
                // If the SDK called onDismissed synchronously before throwing,
                // the callback owns navigation; report handled (true) instead.
                Timber.w(e, "Interstitial SDK show threw")
                val callbackAlreadyHandled = !finished.compareAndSet(false, true)
                if (!callbackAlreadyHandled) preload()
                callbackAlreadyHandled
            }
        }
    }
