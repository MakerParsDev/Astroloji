package com.parsfilo.astrology.core.ads

import android.app.Activity
import android.content.Context
import com.google.android.gms.ads.OnUserEarnedRewardListener
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAd
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.Test

class FullScreenAdCacheManagerExpiryTest {
    private val activity = mockk<Activity>(relaxed = true)

    private fun setCachedAd(
        manager: Any,
        adField: String,
        ad: Any,
        revision: Long,
    ) {
        manager.javaClass.getDeclaredField(adField).apply {
            isAccessible = true
            set(manager, ad)
        }
        manager.javaClass.getDeclaredField("loadedConsentRevision").apply {
            isAccessible = true
            setLong(manager, revision)
        }
        manager.javaClass.getDeclaredField("loadedAtNanos").apply {
            isAccessible = true
            setLong(manager, System.nanoTime() - FULL_SCREEN_AD_TTL_NANOS)
        }
    }

    @Test
    fun `expired interstitial cannot reach SDK show`() {
        val consent = mockk<GoogleMobileAdsConsentManager>(relaxed = true)
        every { consent.canRequestAds } returnsMany listOf(true, false)
        val manager =
            InterstitialAdManager(
                mockk<Context>(relaxed = true),
                consent,
                mockk<AnalyticsRepository>(relaxed = true),
                mockk<AdFrequencyManager>(relaxed = true),
            )
        val ad = mockk<InterstitialAd>(relaxed = true)
        setCachedAd(manager, "interstitialAd", ad, consent.consentRevision)

        assertThat(manager.showIfAvailable(activity, "weekly_back")).isFalse()
        verify(exactly = 0) { ad.show(any<Activity>()) }
    }

    @Test
    fun `expired rewarded cannot start SSV reward flow`() {
        val consent = mockk<GoogleMobileAdsConsentManager>(relaxed = true)
        every { consent.canRequestAds } returnsMany listOf(true, false)
        val manager =
            RewardedAdManager(
                mockk<Context>(relaxed = true),
                consent,
                mockk<AnalyticsRepository>(relaxed = true),
            )
        val ad = mockk<RewardedAd>(relaxed = true)
        setCachedAd(manager, "rewardedAd", ad, consent.consentRevision)

        assertThat(
            manager.showIfAvailable(
                activity,
                RewardedAdRequest("unlock_daily_full", "synthetic-user", "synthetic-challenge", Long.MAX_VALUE),
                onRewardEarned = {},
            ),
        ).isFalse()
        verify(exactly = 0) { ad.show(any<Activity>(), any<OnUserEarnedRewardListener>()) }
    }

    @Test
    fun `expired rewarded interstitial cannot reach SDK show`() {
        val consent = mockk<GoogleMobileAdsConsentManager>(relaxed = true)
        every { consent.canRequestAds } returnsMany listOf(true, false)
        val manager =
            RewardedInterstitialAdManager(
                mockk<Context>(relaxed = true),
                consent,
                mockk<AnalyticsRepository>(relaxed = true),
            )
        val ad = mockk<RewardedInterstitialAd>(relaxed = true)
        setCachedAd(manager, "rewardedInterstitialAd", ad, consent.consentRevision)

        assertThat(manager.showIfAvailable(activity, "weekly_back")).isFalse()
        verify(exactly = 0) { ad.show(any<Activity>(), any<OnUserEarnedRewardListener>()) }
    }
}
