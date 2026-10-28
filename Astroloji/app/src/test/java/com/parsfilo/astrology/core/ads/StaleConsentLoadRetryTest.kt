package com.parsfilo.astrology.core.ads

import android.content.Context
import android.os.SystemClock
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.appopen.AppOpenAd
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.unmockkStatic
import io.mockk.verify
import org.junit.Test

class StaleConsentLoadRetryTest {
    private val context = mockk<Context>(relaxed = true)
    private val analytics = mockk<AnalyticsRepository>(relaxed = true)
    private val consent = mockk<GoogleMobileAdsConsentManager>(relaxed = true)
    private var revision = 4L

    private fun configureConsent() {
        every { consent.canRequestAds } returns true
        every { consent.consentRevision } answers { revision }
    }

    private fun cachedAd(
        manager: Any,
        field: String,
    ): Any? =
        manager.javaClass.getDeclaredField(field).run {
            isAccessible = true
            get(manager)
        }

    @Test
    fun rewardedLateCreativeTriggersNewLoadUnderUpdatedConsent() {
        configureConsent()
        val callbacks = mutableListOf<RewardedAdLoadCallback>()
        mockkStatic(RewardedAd::class)
        try {
            every { RewardedAd.load(any<Context>(), any<String>(), any<AdRequest>(), capture(callbacks)) } just Runs
            val manager = RewardedAdManager(context, consent, analytics)
            manager.preload()
            assertThat(callbacks).hasSize(1)

            revision = 5L
            callbacks[0].onAdLoaded(mockk<RewardedAd>(relaxed = true))
            assertThat(cachedAd(manager, "rewardedAd")).isNull()
            assertThat(callbacks).hasSize(2)

            val fresh = mockk<RewardedAd>(relaxed = true)
            callbacks[1].onAdLoaded(fresh)
            assertThat(cachedAd(manager, "rewardedAd")).isSameInstanceAs(fresh)
        } finally {
            unmockkStatic(RewardedAd::class)
        }
    }

    @Test
    fun obsoleteRewardedFailureCannotBackoffCurrentConsentRequest() {
        configureConsent()
        val callbacks = mutableListOf<RewardedAdLoadCallback>()
        mockkStatic(RewardedAd::class)
        mockkStatic(SystemClock::class)
        try {
            every { SystemClock.elapsedRealtime() } returns 10_000L
            every { RewardedAd.load(any<Context>(), any<String>(), any<AdRequest>(), capture(callbacks)) } just Runs
            val manager = RewardedAdManager(context, consent, analytics)
            manager.preload()

            revision = 5L
            callbacks[0].onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))
            assertThat(callbacks).hasSize(2)
            verify(exactly = 2) {
                RewardedAd.load(any<Context>(), any<String>(), any<AdRequest>(), any<RewardedAdLoadCallback>())
            }
        } finally {
            unmockkStatic(SystemClock::class)
            unmockkStatic(RewardedAd::class)
        }
    }

    /** Both cases first observe a real failure in the same UMP revision. */
    private fun withRewardedLoadInBackoff(verifyCase: (RewardedAdManager, List<RewardedAdLoadCallback>) -> Unit) {
        configureConsent()
        val callbacks = mutableListOf<RewardedAdLoadCallback>()
        mockkStatic(RewardedAd::class)
        mockkStatic(SystemClock::class)
        try {
            every { SystemClock.elapsedRealtime() } returns 10_000L
            every { RewardedAd.load(any<Context>(), any<String>(), any<AdRequest>(), capture(callbacks)) } just Runs
            val manager = RewardedAdManager(context, consent, analytics)
            manager.preload()
            callbacks.single().onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))
            manager.preload()
            assertThat(callbacks).hasSize(1)
            verifyCase(manager, callbacks)
        } finally {
            unmockkStatic(SystemClock::class)
            unmockkStatic(RewardedAd::class)
        }
    }

    @Test
    fun rewardedFailureBackoffFromOldConsentCannotBlockNewRequest() =
        withRewardedLoadInBackoff { manager, callbacks ->
            revision = 5L
            manager.preload()
            assertThat(callbacks).hasSize(2)
        }

    @Test
    fun realRewardedLoadFailureStillUsesNormalBackoff() =
        withRewardedLoadInBackoff { manager, callbacks ->
            every { SystemClock.elapsedRealtime() } returns 40_000L
            manager.preload()
            assertThat(callbacks).hasSize(2)
        }

    @Test
    fun obsoleteInterstitialFailureTriggersFreshLoadWithoutBackoff() {
        configureConsent()
        val callbacks = mutableListOf<InterstitialAdLoadCallback>()
        mockkStatic(InterstitialAd::class)
        try {
            every { InterstitialAd.load(any<Context>(), any<String>(), any<AdRequest>(), capture(callbacks)) } just Runs
            val manager = InterstitialAdManager(context, consent, analytics, mockk(relaxed = true))
            manager.preload()
            revision = 5L
            callbacks[0].onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))
            assertThat(callbacks).hasSize(2)
            val fresh = mockk<InterstitialAd>(relaxed = true)
            callbacks[1].onAdLoaded(fresh)
            assertThat(cachedAd(manager, "interstitialAd")).isSameInstanceAs(fresh)
        } finally {
            unmockkStatic(InterstitialAd::class)
        }
    }

    @Test
    fun interstitialFailureBackoffIsResetForNewConsentButNotWhileRevoked() {
        configureConsent()
        val callbacks = mutableListOf<InterstitialAdLoadCallback>()
        mockkStatic(InterstitialAd::class)
        mockkStatic(SystemClock::class)
        try {
            every { SystemClock.elapsedRealtime() } returns 10_000L
            every { InterstitialAd.load(any<Context>(), any<String>(), any<AdRequest>(), capture(callbacks)) } just Runs
            val manager = InterstitialAdManager(context, consent, analytics, mockk(relaxed = true))
            manager.preload()
            callbacks[0].onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))
            manager.preload()
            assertThat(callbacks).hasSize(1)

            revision = 5L
            every { consent.canRequestAds } returns false
            manager.preload()
            assertThat(callbacks).hasSize(1)

            revision = 6L
            every { consent.canRequestAds } returns true
            manager.preload()
            assertThat(callbacks).hasSize(2)
        } finally {
            unmockkStatic(SystemClock::class)
            unmockkStatic(InterstitialAd::class)
        }
    }

    @Test
    fun appOpenFailureBackoffIsResetForNewConsentWithoutWaitingThirtySeconds() {
        configureConsent()
        val callbacks = mutableListOf<AppOpenAd.AppOpenAdLoadCallback>()
        mockkStatic(AppOpenAd::class)
        mockkStatic(SystemClock::class)
        try {
            every { SystemClock.elapsedRealtime() } returns 10_000L
            every { AppOpenAd.load(any<Context>(), any<String>(), any<AdRequest>(), capture(callbacks)) } just Runs
            val manager = AppOpenAdManager(context, consent, analytics)
            manager.preload()
            callbacks[0].onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))
            manager.preload()
            assertThat(callbacks).hasSize(1)

            revision = 5L
            manager.preload()
            assertThat(callbacks).hasSize(2)
        } finally {
            unmockkStatic(SystemClock::class)
            unmockkStatic(AppOpenAd::class)
        }
    }

    @Test
    fun obsoleteAppOpenCreativeTriggersLoadUsingLatestPermission() {
        configureConsent()
        val callbacks = mutableListOf<AppOpenAd.AppOpenAdLoadCallback>()
        mockkStatic(AppOpenAd::class)
        mockkStatic(SystemClock::class)
        try {
            every { SystemClock.elapsedRealtime() } returns 10_000L
            every { AppOpenAd.load(any<Context>(), any<String>(), any<AdRequest>(), capture(callbacks)) } just Runs
            val manager = AppOpenAdManager(context, consent, analytics)
            manager.preload()
            revision = 5L
            callbacks[0].onAdLoaded(mockk<AppOpenAd>(relaxed = true))
            assertThat(cachedAd(manager, "appOpenAd")).isNull()
            assertThat(callbacks).hasSize(2)
            val fresh = mockk<AppOpenAd>(relaxed = true)
            callbacks[1].onAdLoaded(fresh)
            assertThat(cachedAd(manager, "appOpenAd")).isSameInstanceAs(fresh)
        } finally {
            unmockkStatic(SystemClock::class)
            unmockkStatic(AppOpenAd::class)
        }
    }
}
