package com.parsfilo.astrology.core.ads

import android.content.Context
import android.os.SystemClock
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.LoadAdError
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
import org.junit.Test

/** One consent decision must not inherit a load backoff from a previous decision. */
class ConsentRevisionAdRetryTest {
    private val context = mockk<Context>(relaxed = true)
    private val consent = mockk<GoogleMobileAdsConsentManager>(relaxed = true)
    private val analytics = mockk<AnalyticsRepository>(relaxed = true)
    private var now = 10_000L
    private var revision = 1L

    @Test
    fun rewardedFailureFromPriorConsentCannotDelayAuthorizedPreload() {
        val callbacks = mutableListOf<RewardedAdLoadCallback>()
        mockkStatic(SystemClock::class)
        mockkStatic(RewardedAd::class)
        try {
            every { SystemClock.elapsedRealtime() } answers { now }
            every { consent.canRequestAds } returns true
            every { consent.consentRevision } answers { revision }
            every {
                RewardedAd.load(any<Context>(), any<String>(), any<AdRequest>(), capture(callbacks))
            } just Runs
            val manager = RewardedAdManager(context, consent, analytics)
            manager.preload()
            callbacks[0].onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))
            manager.preload()
            assertThat(callbacks).hasSize(1)
            revision = 2L
            manager.preload()
            assertThat(callbacks).hasSize(2)
            callbacks[1].onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))
            manager.preload()
            assertThat(callbacks).hasSize(2) // Same consent must still back off.
        } finally {
            unmockkStatic(RewardedAd::class)
            unmockkStatic(SystemClock::class)
        }
    }

    @Test
    fun interstitialFailureFromPriorConsentCannotDelayAuthorizedPreload() {
        val callbacks = mutableListOf<InterstitialAdLoadCallback>()
        mockkStatic(SystemClock::class)
        mockkStatic(InterstitialAd::class)
        try {
            every { SystemClock.elapsedRealtime() } answers { now }
            every { consent.canRequestAds } returns true
            every { consent.consentRevision } answers { revision }
            every {
                InterstitialAd.load(any<Context>(), any<String>(), any<AdRequest>(), capture(callbacks))
            } just Runs
            val manager = InterstitialAdManager(context, consent, analytics, mockk(relaxed = true))
            manager.preload()
            callbacks[0].onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))
            manager.preload()
            assertThat(callbacks).hasSize(1)
            revision = 2L
            manager.preload()
            assertThat(callbacks).hasSize(2)
            callbacks[1].onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))
            manager.preload()
            assertThat(callbacks).hasSize(2)
        } finally {
            unmockkStatic(InterstitialAd::class)
            unmockkStatic(SystemClock::class)
        }
    }

    @Test
    fun rewardedStaleFailureDoesNotReloadWhenConsentIsRevoked() {
        val callbacks = mutableListOf<RewardedAdLoadCallback>()
        var allowed = true
        mockkStatic(SystemClock::class)
        mockkStatic(RewardedAd::class)
        try {
            every { SystemClock.elapsedRealtime() } answers { now }
            every { consent.canRequestAds } answers { allowed }
            every { consent.consentRevision } answers { revision }
            every {
                RewardedAd.load(any<Context>(), any<String>(), any<AdRequest>(), capture(callbacks))
            } just Runs
            val manager = RewardedAdManager(context, consent, analytics)
            manager.preload()
            revision = 2L
            allowed = false
            callbacks[0].onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))
            assertThat(callbacks).hasSize(1)
            manager.preload()
            assertThat(callbacks).hasSize(1)

            allowed = true
            manager.preload()
            assertThat(callbacks).hasSize(2)
        } finally {
            unmockkStatic(RewardedAd::class)
            unmockkStatic(SystemClock::class)
        }
    }

    @Test
    fun interstitialStaleFailureDoesNotReloadWhenConsentIsRevoked() {
        val callbacks = mutableListOf<InterstitialAdLoadCallback>()
        var allowed = true
        mockkStatic(SystemClock::class)
        mockkStatic(InterstitialAd::class)
        try {
            every { SystemClock.elapsedRealtime() } answers { now }
            every { consent.canRequestAds } answers { allowed }
            every { consent.consentRevision } answers { revision }
            every {
                InterstitialAd.load(any<Context>(), any<String>(), any<AdRequest>(), capture(callbacks))
            } just Runs
            val manager = InterstitialAdManager(context, consent, analytics, mockk(relaxed = true))
            manager.preload()
            revision = 2L
            allowed = false
            callbacks[0].onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))
            assertThat(callbacks).hasSize(1)
            manager.preload()
            assertThat(callbacks).hasSize(1)

            allowed = true
            manager.preload()
            assertThat(callbacks).hasSize(2)
        } finally {
            unmockkStatic(InterstitialAd::class)
            unmockkStatic(SystemClock::class)
        }
    }
}
