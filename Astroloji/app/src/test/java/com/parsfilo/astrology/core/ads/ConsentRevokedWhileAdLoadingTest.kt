package com.parsfilo.astrology.core.ads

import android.content.Context
import android.os.SystemClock
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.appopen.AppOpenAd
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAd
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAdLoadCallback
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.slot
import io.mockk.unmockkStatic
import io.mockk.verify
import org.junit.Test

/** SDK load callbacks may arrive after UMP permission changes. Cached creatives must not survive revocation. */
class ConsentRevokedWhileAdLoadingTest {
    private val context = mockk<Context>(relaxed = true)
    private val analytics = mockk<AnalyticsRepository>(relaxed = true)
    private val consent = mockk<GoogleMobileAdsConsentManager>(relaxed = true)

    private fun cachedAd(
        manager: Any,
        fieldName: String,
    ): Any? =
        manager.javaClass.getDeclaredField(fieldName).run {
            isAccessible = true
            get(manager)
        }

    @Test
    fun `app open ignores late load callback after consent revoked`() {
        val callback = slot<AppOpenAd.AppOpenAdLoadCallback>()
        val manager = AppOpenAdManager(context, consent, analytics)
        mockkStatic(AppOpenAd::class)
        mockkStatic(SystemClock::class)
        try {
            every { consent.canRequestAds } returns true
            every { SystemClock.elapsedRealtime() } returns 1234L
            every { AppOpenAd.load(any<Context>(), any<String>(), any<AdRequest>(), capture(callback)) } just Runs
            manager.preload()

            every { consent.canRequestAds } returns false
            callback.captured.onAdLoaded(mockk<AppOpenAd>(relaxed = true))
            every { consent.canRequestAds } returns true

            assertThat(cachedAd(manager, "appOpenAd")).isNull()
            // A legitimate new preload can run after permission is restored.
            manager.preload()
            verify(exactly = 2) {
                AppOpenAd.load(
                    any<Context>(),
                    any<String>(),
                    any<AdRequest>(),
                    any<AppOpenAd.AppOpenAdLoadCallback>(),
                )
            }
        } finally {
            unmockkStatic(AppOpenAd::class)
            unmockkStatic(SystemClock::class)
        }
    }

    @Test
    fun `interstitial ignores late load callback after consent revoked`() {
        val callback = slot<InterstitialAdLoadCallback>()
        val manager = InterstitialAdManager(context, consent, analytics, mockk(relaxed = true))
        mockkStatic(InterstitialAd::class)
        try {
            every { consent.canRequestAds } returns true
            every { InterstitialAd.load(any<Context>(), any<String>(), any<AdRequest>(), capture(callback)) } just Runs
            manager.preload()

            every { consent.canRequestAds } returns false
            callback.captured.onAdLoaded(mockk<InterstitialAd>(relaxed = true))
            every { consent.canRequestAds } returns true

            assertThat(cachedAd(manager, "interstitialAd")).isNull()
            // A legitimate new preload can run after permission is restored.
            manager.preload()
            verify(exactly = 2) {
                InterstitialAd.load(
                    any<Context>(),
                    any<String>(),
                    any<AdRequest>(),
                    any<InterstitialAdLoadCallback>(),
                )
            }
        } finally {
            unmockkStatic(InterstitialAd::class)
        }
    }

    @Test
    fun `rewarded ignores late load callback after consent revoked`() {
        val callback = slot<RewardedAdLoadCallback>()
        val manager = RewardedAdManager(context, consent, analytics)
        mockkStatic(RewardedAd::class)
        try {
            every { consent.canRequestAds } returns true
            every { RewardedAd.load(any<Context>(), any<String>(), any<AdRequest>(), capture(callback)) } just Runs
            manager.preload()

            every { consent.canRequestAds } returns false
            callback.captured.onAdLoaded(mockk<RewardedAd>(relaxed = true))
            every { consent.canRequestAds } returns true

            assertThat(cachedAd(manager, "rewardedAd")).isNull()
            // A legitimate new preload can run after permission is restored.
            manager.preload()
            verify(exactly = 2) {
                RewardedAd.load(
                    any<Context>(),
                    any<String>(),
                    any<AdRequest>(),
                    any<RewardedAdLoadCallback>(),
                )
            }
        } finally {
            unmockkStatic(RewardedAd::class)
        }
    }

    @Test
    fun `rewarded interstitial ignores late load callback after consent revoked`() {
        val callback = slot<RewardedInterstitialAdLoadCallback>()
        val manager = RewardedInterstitialAdManager(context, consent, analytics)
        mockkStatic(RewardedInterstitialAd::class)
        try {
            every { consent.canRequestAds } returns true
            every {
                RewardedInterstitialAd.load(
                    any<Context>(),
                    any<String>(),
                    any<AdRequest>(),
                    capture(callback),
                )
            } just Runs
            manager.preload()

            every { consent.canRequestAds } returns false
            callback.captured.onAdLoaded(mockk<RewardedInterstitialAd>(relaxed = true))
            every { consent.canRequestAds } returns true

            assertThat(cachedAd(manager, "rewardedInterstitialAd")).isNull()
            // A legitimate new preload can run after permission is restored.
            manager.preload()
            verify(exactly = 2) {
                RewardedInterstitialAd.load(
                    any<Context>(),
                    any<String>(),
                    any<AdRequest>(),
                    any<RewardedInterstitialAdLoadCallback>(),
                )
            }
        } finally {
            unmockkStatic(RewardedInterstitialAd::class)
        }
    }
}
