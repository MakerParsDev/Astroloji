package com.parsfilo.astrology.core.ads

import android.app.Activity
import android.content.Context
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
import javax.inject.Inject
import javax.inject.Singleton

private const val APP_OPEN_TIMEOUT_MS = 4 * 60 * 60 * 1000L

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
        private var isShowing = false
        private var loadTime = 0L
        private var appOpenAd: AppOpenAd? = null

        fun preload() {
            if (isLoading || isAdAvailable() || !consentManager.canRequestAds) return
            isLoading = true
            AppOpenAd.load(
                context,
                AdMobUnits.appOpen,
                AdRequest.Builder().build(),
                object : AppOpenAd.AppOpenAdLoadCallback() {
                    override fun onAdLoaded(ad: AppOpenAd) {
                        appOpenAd = ad
                        isLoading = false
                        loadTime = System.currentTimeMillis()
                        Timber.d("App open ad loaded")
                    }

                    override fun onAdFailedToLoad(error: LoadAdError) {
                        appOpenAd = null
                        isLoading = false
                        Timber.w("App open ad failed: %s", error.message)
                    }
                },
            )
        }

        fun showIfAvailable(
            activity: Activity,
            placement: String = "app_open",
            onDismissed: () -> Unit = {},
        ): Boolean {
            if (activity.isFinishing || activity.isDestroyed || !activity.hasWindowFocus() || !consentManager.canRequestAds) {
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
            ad.fullScreenContentCallback =
                object : FullScreenContentCallback() {
                    override fun onAdDismissedFullScreenContent() {
                        isShowing = false
                        preload()
                        onDismissed()
                    }

                    override fun onAdFailedToShowFullScreenContent(error: com.google.android.gms.ads.AdError) {
                        isShowing = false
                        preload()
                        Timber.w("App open show failed: %s", error.message)
                        onDismissed()
                    }

                    override fun onAdImpression() {
                        scope.launch {
                            analyticsRepository.track(
                                AnalyticsEvents.AD_SHOWN,
                                mapOf("format" to "app_open", "placement" to placement),
                            )
                        }
                    }
                }
            runCatching {
                ad.show(activity)
            }.onFailure {
                isShowing = false
                Timber.e(it, "App open ad show crashed")
                preload()
                onDismissed()
                return false
            }
            return true
        }

        private fun isAdAvailable(): Boolean = appOpenAd != null && (System.currentTimeMillis() - loadTime) < APP_OPEN_TIMEOUT_MS
    }
