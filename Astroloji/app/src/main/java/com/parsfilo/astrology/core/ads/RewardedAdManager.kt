package com.parsfilo.astrology.core.ads

import android.app.Activity
import android.content.Context
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.rewarded.RewardItem
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import com.google.android.gms.ads.rewarded.ServerSideVerificationOptions
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

data class RewardedAdRequest(
    val placement: String,
    val ssvUserId: String,
    val ssvCustomData: String,
)

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
        private val loadRetryGate = AdLoadRetryGate()
        private var rewardedAd: RewardedAd? = null

        fun preload() {
            val canStartPreload = !isLoading && rewardedAd == null && consentManager.canRequestAds
            if (!canStartPreload || !loadRetryGate.canLoad()) return
            isLoading = true
            RewardedAd.load(
                context,
                AdMobUnits.rewarded,
                AdRequest.Builder().build(),
                object : RewardedAdLoadCallback() {
                    override fun onAdLoaded(ad: RewardedAd) {
                        rewardedAd = ad
                        isLoading = false
                        loadRetryGate.recordSuccess()
                        Timber.d("Rewarded ad loaded")
                    }

                    override fun onAdFailedToLoad(error: LoadAdError) {
                        rewardedAd = null
                        isLoading = false
                        loadRetryGate.recordFailure()
                        Timber.w("Rewarded ad failed: %s", error.message)
                    }
                },
            )
        }

        fun showIfAvailable(
            activity: Activity,
            request: RewardedAdRequest,
            onRewardEarned: (RewardItem) -> Unit,
            onDismissed: () -> Unit = {},
        ): Boolean {
            // Consent can change after preload. Never show an old ad if revoked.
            val consentAllowed = consentManager.canRequestAds
            val ad =
                rewardedAd.takeIf { consentAllowed } ?: run {
                    if (!consentAllowed) rewardedAd = null
                    preload()
                    return false
                }
            rewardedAd = null
            val finished = AtomicBoolean(false)
            val rewardDelivered = AtomicBoolean(false)
            val impressionRecorded = AtomicBoolean(false)
            val dismissOnce = {
                if (finished.compareAndSet(false, true)) {
                    preload()
                    onDismissed()
                }
            }
            val ssvConfigured =
                try {
                    applyRewardSsvOptions(ad, request.ssvUserId, request.ssvCustomData)
                    true
                } catch (e: IllegalStateException) {
                    // Never show a rewarded ad with missing verification options.
                    Timber.w(e, "Rewarded SSV options could not be configured")
                    false
                }
            if (ssvConfigured) {
                ad.fullScreenContentCallback =
                    object : FullScreenContentCallback() {
                        override fun onAdDismissedFullScreenContent() {
                            dismissOnce()
                        }

                        override fun onAdFailedToShowFullScreenContent(error: com.google.android.gms.ads.AdError) {
                            Timber.w("Rewarded show failed: %s", error.message)
                            dismissOnce()
                        }

                        override fun onAdImpression() {
                            if (finished.get() || !impressionRecorded.compareAndSet(false, true)) return
                            scope.launch {
                                analyticsRepository.track(
                                    AnalyticsEvents.AD_SHOWN,
                                    mapOf("format" to "rewarded", "placement" to request.placement),
                                )
                            }
                        }
                    }
            }
            return if (ssvConfigured) {
                try {
                    ad.show(activity) { rewardItem ->
                        // Ignore duplicate or late callbacks after dismissal.
                        if (!finished.get() && rewardDelivered.compareAndSet(false, true)) {
                            onRewardEarned(rewardItem)
                        }
                    }
                    true
                } catch (e: IllegalStateException) {
                    // Synchronous show failure cannot earn a reward.
                    Timber.w(e, "Rewarded SDK show threw")
                    dismissOnce()
                    false
                }
            } else {
                preload()
                false
            }
        }
    }

internal fun applyRewardSsvOptions(
    ad: RewardedAd,
    userId: String,
    customData: String,
) {
    val options =
        ServerSideVerificationOptions
            .Builder()
            .setUserId(userId)
            .setCustomData(customData)
            .build()
    ad.setServerSideVerificationOptions(options)
}
