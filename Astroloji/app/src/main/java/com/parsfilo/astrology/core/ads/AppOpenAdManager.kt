package com.parsfilo.astrology.core.ads

import android.app.Activity
import android.content.Context
import android.os.SystemClock
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.appopen.AppOpenAd
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
class AppOpenAdManager
    @Inject
    constructor(
        @param:ApplicationContext private val context: Context,
        private val consentManager: GoogleMobileAdsConsentManager,
        private val analyticsRepository: AnalyticsRepository,
    ) {
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        private var isLoading = false
        private val loadRetryGate = AdLoadRetryGate()
        private var isShowing = false
        private var loadElapsedRealtimeMs = 0L
        private var appOpenAd: AppOpenAd? = null
        private var loadedConsentRevision = Long.MIN_VALUE

        private fun discardAdFromEarlierConsentRevision() {
            if (loadedConsentRevision == consentManager.consentRevision) return
            appOpenAd = null
            loadElapsedRealtimeMs = 0L
        }

        fun preload() {
            discardAdFromEarlierConsentRevision()
            val loadRevision = consentManager.consentRevision
            val canStartPreload = !isLoading && !isAdAvailable() && consentManager.canRequestAds
            if (!canStartPreload || !loadRetryGate.canLoad()) return
            isLoading = true
            AppOpenAd.load(
                context,
                AdMobUnits.appOpen,
                AdRequest.Builder().build(),
                object : AppOpenAd.AppOpenAdLoadCallback() {
                    override fun onAdLoaded(ad: AppOpenAd) {
                        isLoading = false
                        // A request may finish after UMP consent was revoked.
                        // Never retain the pre-revocation creative for a later grant.
                        if (!consentManager.canRequestAds || consentManager.consentRevision != loadRevision) {
                            appOpenAd = null
                            loadElapsedRealtimeMs = 0L
                            // Retry under the latest UMP decision, not the obsolete load.
                            if (consentManager.canRequestAds) preload()
                            return
                        }
                        appOpenAd = ad
                        loadedConsentRevision = loadRevision
                        loadRetryGate.recordSuccess()
                        loadElapsedRealtimeMs = SystemClock.elapsedRealtime()
                        Timber.d("App open ad loaded")
                    }

                    override fun onAdFailedToLoad(error: LoadAdError) {
                        appOpenAd = null
                        isLoading = false
                        // A failed request from before a privacy update must not
                        // impose backoff on a new consent revision.
                        if (consentManager.consentRevision != loadRevision) {
                            if (consentManager.canRequestAds) preload()
                            return
                        }
                        loadRetryGate.recordFailure()
                        Timber.w("App open ad failed: %s", error.message)
                    }
                },
            )
        }

        // Google Mobile Ads is an external SDK; a runtime exception during show
        // must not crash startup or double-notify navigation after a callback.
        @Suppress("TooGenericExceptionCaught", "ReturnCount")
        fun showIfAvailable(
            activity: Activity,
            placement: String = "app_open",
            onDismissed: () -> Unit = {},
        ): Boolean {
            discardAdFromEarlierConsentRevision()
            if (!consentManager.canRequestAds) {
                // Cached creative belongs to the prior consent state. Do not
                // reuse it if consent is later restored.
                appOpenAd = null
                loadElapsedRealtimeMs = 0L
                return false
            }
            if (activity.isFinishing || activity.isDestroyed || !activity.hasWindowFocus()) {
                preload()
                return false
            }
            if (isShowing || !isAdAvailable()) {
                preload()
                return false
            }

            val ad = appOpenAd ?: return false
            isShowing = true
            appOpenAd = null
            val finished = AtomicBoolean(false)
            val impressionRecorded = AtomicBoolean(false)
            val dismissOnce = {
                if (finished.compareAndSet(false, true)) {
                    isShowing = false
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
                        Timber.w("App open show failed: %s", error.message)
                        dismissOnce()
                    }

                    override fun onAdImpression() {
                        // An SDK can deliver duplicate or late impression callbacks.
                        // Only a real first impression should be sent to analytics.
                        if (finished.get() || !impressionRecorded.compareAndSet(false, true)) return
                        scope.launch {
                            analyticsRepository.track(
                                AnalyticsEvents.AD_SHOWN,
                                mapOf("format" to "app_open", "placement" to placement),
                            )
                        }
                    }
                }
            return try {
                ad.show(activity)
                true
            } catch (exception: RuntimeException) {
                Timber.e(exception, "App open ad show failed")
                // A broken SDK may invoke a terminal callback and THEN throw.
                // Report it as handled if the callback already resumed the UI.
                val callbackAlreadyHandled = finished.get()
                dismissOnce()
                callbackAlreadyHandled
            }
        }

        private fun isAdAvailable(): Boolean =
            appOpenAd != null &&
                isFreshAppOpenAd(
                    loadedAtElapsedMs = loadElapsedRealtimeMs,
                    nowElapsedMs = SystemClock.elapsedRealtime(),
                )
    }
