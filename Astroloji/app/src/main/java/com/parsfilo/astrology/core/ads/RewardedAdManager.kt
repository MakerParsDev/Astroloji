package com.parsfilo.astrology.core.ads

import android.app.Activity
import android.content.Context
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.rewarded.RewardItem
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
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

@Singleton
class RewardedAdManager
    @Inject
    constructor(
        @param:ApplicationContext private val context: Context,
        private val consentManager: GoogleMobileAdsConsentManager,
        private val analyticsRepository: AnalyticsRepository,
    ) {
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        private var isLoading = false
        private var rewardedAd: RewardedAd? = null

        fun preload() {
            if (isLoading || rewardedAd != null || !consentManager.canRequestAds) return
            isLoading = true
            RewardedAd.load(
                context,
                AdMobUnits.rewarded,
                AdRequest.Builder().build(),
                object : RewardedAdLoadCallback() {
                    override fun onAdLoaded(ad: RewardedAd) {
                        rewardedAd = ad
                        isLoading = false
                        Timber.d("Rewarded ad loaded")
                    }

                    override fun onAdFailedToLoad(error: LoadAdError) {
                        rewardedAd = null
                        isLoading = false
                        Timber.w("Rewarded ad failed: %s", error.message)
                    }
                },
            )
        }

        fun showIfAvailable(
            activity: Activity,
            placement: String,
            onRewardEarned: (RewardItem) -> Unit,
            onDismissed: () -> Unit = {},
        ): Boolean {
            val ad =
                rewardedAd ?: run {
                    preload()
                    return false
                }
            rewardedAd = null
            ad.fullScreenContentCallback =
                object : FullScreenContentCallback() {
                    override fun onAdDismissedFullScreenContent() {
                        preload()
                        onDismissed()
                    }

                    override fun onAdFailedToShowFullScreenContent(error: com.google.android.gms.ads.AdError) {
                        Timber.w("Rewarded show failed: %s", error.message)
                        preload()
                        onDismissed()
                    }

                    override fun onAdImpression() {
                        scope.launch {
                            analyticsRepository.track(
                                AnalyticsEvents.AD_SHOWN,
                                mapOf("format" to "rewarded", "placement" to placement),
                            )
                        }
                    }
                }
            ad.show(activity) { rewardItem -> onRewardEarned(rewardItem) }
            return true
        }
    }
