package com.parsfilo.astrology.core.ads

import android.app.Activity
import android.content.Context
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import io.mockk.Runs
import io.mockk.coVerify
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.junit.Test

class InterstitialImpressionAccountingTest {
    private val activity = mockk<Activity>(relaxed = true)
    private val consent = mockk<GoogleMobileAdsConsentManager>()
    private val frequency = mockk<AdFrequencyManager>(relaxed = true)
    private val analytics = mockk<AnalyticsRepository>(relaxed = true)

    private fun manager(): InterstitialAdManager =
        InterstitialAdManager(
            mockk<Context>(relaxed = true),
            consent,
            analytics,
            frequency,
        )

    private fun preloadedAd(manager: InterstitialAdManager): InterstitialAd {
        val ad = mockk<InterstitialAd>()
        InterstitialAdManager::class.java.getDeclaredField("interstitialAd").apply {
            isAccessible = true
            set(manager, ad)
        }
        return ad
    }

    @Test
    fun `attempt and failed show never consume the daily quota`() {
        every { consent.canRequestAds } returns true
        val manager = manager()
        val ad = preloadedAd(manager)
        val callback = slot<FullScreenContentCallback>()
        every { ad.fullScreenContentCallback = capture(callback) } just Runs
        every { ad.show(activity) } just Runs

        var dismissed = 0
        assertThat(manager.showIfAvailable(activity, "weekly_back") { dismissed++ }).isTrue()
        coVerify(exactly = 0) { frequency.recordInterstitialShown(any()) }
        every { consent.canRequestAds } returns false
        callback.captured.onAdFailedToShowFullScreenContent(mockk<AdError>(relaxed = true))

        assertThat(dismissed).isEqualTo(1)
        coVerify(exactly = 0) { frequency.recordInterstitialShown(any()) }
        verify(exactly = 1) { ad.show(activity) }
    }

    @Test
    fun `real impression records daily cap once`() {
        every { consent.canRequestAds } returns true
        val manager = manager()
        val ad = preloadedAd(manager)
        val callback = slot<FullScreenContentCallback>()
        every { ad.fullScreenContentCallback = capture(callback) } just Runs
        every { ad.show(activity) } just Runs

        assertThat(manager.showIfAvailable(activity, "monthly_back")).isTrue()
        coVerify(exactly = 0) { frequency.recordInterstitialShown(any()) }
        callback.captured.onAdImpression()
        coVerify(exactly = 1, timeout = 3000) { frequency.recordInterstitialShown(any()) }
    }

    @Test
    fun `preloaded ad cannot display after UMP consent is revoked`() {
        every { consent.canRequestAds } returns false
        val manager = manager()
        val ad = preloadedAd(manager)

        assertThat(manager.showIfAvailable(activity, "weekly_back")).isFalse()
        verify(exactly = 0) { ad.show(any()) }
        coVerify(exactly = 0) { frequency.recordInterstitialShown(any()) }
    }
}
