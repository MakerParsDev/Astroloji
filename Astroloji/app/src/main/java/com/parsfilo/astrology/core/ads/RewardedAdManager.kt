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

private const val MIN_REWARD_LIFETIME_MS = 60_000L

data class RewardedAdRequest(
    val placement: String,
    val ssvUserId: String,
    val ssvCustomData: String,
    val expiresAtMillis: Long,
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
        private var loadedConsentRevision = Long.MIN_VALUE

        private fun discardAdFromEarlierConsentRevision() {
            if (loadedConsentRevision == consentManager.consentRevision) return
            rewardedAd = null
        }

        fun preload() {
            discardAdFromEarlierConsentRevision()
            val loadRevision = consentManager.consentRevision
            val canStartPreload = !isLoading && rewardedAd == null && consentManager.canRequestAds
            if (!canStartPreload || !loadRetryGate.canLoad()) return
            isLoading = true
            RewardedAd.load(
                context,
                AdMobUnits.rewarded,
                AdRequest.Builder().build(),
                object : RewardedAdLoadCallback() {
                    override fun onAdLoaded(ad: RewardedAd) {
                        isLoading = false
                        // Consent can be revoked while the SDK is loading this creative.
                        if (!consentManager.canRequestAds || consentManager.consentRevision != loadRevision) {
                            rewardedAd = null
                            return
                        }
                        rewardedAd = ad
                        loadedConsentRevision = loadRevision
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

        @Suppress("ReturnCount")
        fun showIfAvailable(
            activity: Activity,
            request: RewardedAdRequest,
            onRewardEarned: (RewardItem) -> Unit,
            onDismissed: () -> Unit = {},
        ): Boolean {
            // Never play an ad that cannot be attributed to a valid SSV claim.
            // Keep the cached creative available for a later valid request.
            if (request.ssvUserId.isBlank() || request.ssvCustomData.isBlank()) return false
            // A valid prepare response may expire before the Compose effect is
            // collected. Avoid showing an ad the backend can no longer verify.
            if (request.expiresAtMillis < System.currentTimeMillis() + MIN_REWARD_LIFETIME_MS) return false
            discardAdFromEarlierConsentRevision()
            // Consent can change after preload. Never show an old ad if revoked.
            val consentAllowed = consentManager.canRequestAds
            val ad =
                rewardedAd.takeIf { consentAllowed } ?: run {
                    if (!consentAllowed) rewardedAd = null
                    preload()
                    return false
                }
            rewardedAd = null
            val attempt = RewardedAdAttemptState()
            val telemetry = RewardedAdLifecycleTelemetry(scope, analyticsRepository, request.placement)
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
                bindFullScreenCallbacks(
                    ad,
                    telemetry,
                    attempt.finished,
                    attempt.rewardDelivered,
                    onDismissed,
                )
            }
            return if (ssvConfigured) {
                showPreparedRewardedAd(ad, activity, attempt, telemetry, onRewardEarned)
            } else {
                preload()
                false
            }
        }

        private fun showPreparedRewardedAd(
            ad: RewardedAd,
            activity: Activity,
            attempt: RewardedAdAttemptState,
            telemetry: RewardedAdLifecycleTelemetry,
            onRewardEarned: (RewardItem) -> Unit,
        ): Boolean =
            try {
                ad.show(activity) { rewardItem ->
                    // Ignore duplicate or late callbacks after dismissal.
                    if (!attempt.finished.get() && attempt.rewardDelivered.compareAndSet(false, true)) {
                        // SDK callback, NOT an SSV-verified entitlement.
                        telemetry.earned()
                        onRewardEarned(rewardItem)
                    }
                }
                true
            } catch (e: IllegalStateException) {
                Timber.w(e, "Rewarded SDK show threw")
                // When a callback already handled dismissal, the caller must not repeat it.
                val callbackAlreadyHandled = !attempt.finished.compareAndSet(false, true)
                if (!callbackAlreadyHandled) {
                    if (!attempt.rewardDelivered.get()) telemetry.failed("show_exception")
                    preload()
                }
                callbackAlreadyHandled || attempt.rewardDelivered.get()
            }

        private fun bindFullScreenCallbacks(
            ad: RewardedAd,
            telemetry: RewardedAdLifecycleTelemetry,
            finished: AtomicBoolean,
            rewardDelivered: AtomicBoolean,
            onDismissed: () -> Unit,
        ) {
            val dismissOnce: (String) -> Unit = { reason ->
                if (finished.compareAndSet(false, true)) {
                    if (!rewardDelivered.get()) telemetry.failed(reason)
                    preload()
                    onDismissed()
                }
            }
            ad.fullScreenContentCallback =
                object : FullScreenContentCallback() {
                    override fun onAdShowedFullScreenContent() {
                        telemetry.shown(!finished.get())
                    }

                    override fun onAdDismissedFullScreenContent() {
                        dismissOnce("dismissed_without_reward")
                    }

                    override fun onAdFailedToShowFullScreenContent(error: com.google.android.gms.ads.AdError) {
                        Timber.w("Rewarded show failed: %s", error.message)
                        dismissOnce("show_failed")
                    }

                    override fun onAdImpression() {
                        telemetry.impression(!finished.get())
                    }
                }
        }
    }

internal class RewardedAdAttemptState {
    val finished = AtomicBoolean(false)
    val rewardDelivered = AtomicBoolean(false)
}

// Best-effort SDK UI callbacks, never SSV-verified entitlements.
// Log only static metadata: no AdMob user ID, challenge ID, or transaction token.
internal class RewardedAdLifecycleTelemetry(
    private val scope: CoroutineScope,
    private val analyticsRepository: AnalyticsRepository,
    placement: String,
) {
    private val metadata = mapOf("format" to "rewarded", "placement" to placement)
    private val started = AtomicBoolean(false)
    private val terminal = AtomicBoolean(false)
    private val impressionRecorded = AtomicBoolean(false)

    fun shown(active: Boolean) {
        if (active && started.compareAndSet(false, true)) {
            record(AnalyticsEvents.REWARDED_AD_STARTED)
        }
    }

    fun impression(active: Boolean) {
        if (active && impressionRecorded.compareAndSet(false, true)) {
            record(AnalyticsEvents.AD_SHOWN)
        }
    }

    fun earned() {
        if (terminal.compareAndSet(false, true)) {
            record(AnalyticsEvents.REWARDED_AD_COMPLETED, "sdk_reward_callback")
        }
    }

    fun failed(reason: String) {
        if (terminal.compareAndSet(false, true)) {
            record(AnalyticsEvents.REWARDED_AD_FAILED, reason)
        }
    }

    private fun record(
        event: String,
        reason: String? = null,
    ) {
        val safeMeta = if (reason == null) metadata else metadata + ("reason" to reason)
        scope.launch { analyticsRepository.track(event, safeMeta) }
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
