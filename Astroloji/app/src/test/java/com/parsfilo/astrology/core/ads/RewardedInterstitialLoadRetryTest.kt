package com.parsfilo.astrology.core.ads

import android.content.Context
import android.os.SystemClock
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAd
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAdLoadCallback
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.unmockkStatic
import org.junit.Test

class RewardedInterstitialLoadRetryTest {
    private val context = mockk<Context>(relaxed = true)
    private val consent = mockk<GoogleMobileAdsConsentManager>(relaxed = true)
    private val analytics = mockk<AnalyticsRepository>(relaxed = true)
    private var now = 10_000L
    private var revision = 1L
    private val callbacks = mutableListOf<RewardedInterstitialAdLoadCallback>()

    private fun withSdkMocks(block: (RewardedInterstitialAdManager) -> Unit) {
        mockkStatic(SystemClock::class)
        mockkStatic(RewardedInterstitialAd::class)
        try {
            every { SystemClock.elapsedRealtime() } answers { now }
            every { consent.canRequestAds } returns true
            every { consent.consentRevision } answers { revision }
            every {
                RewardedInterstitialAd.load(
                    any<Context>(),
                    any<String>(),
                    any<AdRequest>(),
                    capture(callbacks),
                )
            } just Runs
            block(RewardedInterstitialAdManager(context, consent, analytics))
        } finally {
            unmockkStatic(RewardedInterstitialAd::class)
            unmockkStatic(SystemClock::class)
        }
    }

    @Test
    fun failedLoadSuppressesRepeatedRequestsUntilBackoffExpires() =
        withSdkMocks { manager ->
            manager.preload()
            assertThat(callbacks).hasSize(1)
            callbacks[0].onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))

            manager.preload()
            now += 29_999L
            manager.preload()
            assertThat(callbacks).hasSize(1)

            now += 1L
            manager.preload()
            assertThat(callbacks).hasSize(2)
        }

    @Test
    fun successfulLoadResetsBackoffToInitialInterval() =
        withSdkMocks { manager ->
            manager.preload()
            callbacks[0].onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))

            now += 30_000L
            manager.preload()
            callbacks[1].onAdLoaded(mockk<RewardedInterstitialAd>(relaxed = true))
            // Clear only the test's cached creative to simulate a consumed ad.
            val field = RewardedInterstitialAdManager::class.java.getDeclaredField("rewardedInterstitialAd")
            field.isAccessible = true
            field.set(manager, null)

            manager.preload()
            assertThat(callbacks).hasSize(3)
            callbacks[2].onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))
            now += 29_999L
            manager.preload()
            assertThat(callbacks).hasSize(3)
            now += 1L
            manager.preload()
            assertThat(callbacks).hasSize(4)
        }

    @Test
    fun previousRevisionFailureBackoffCannotBlockNewConsent() =
        withSdkMocks { manager ->
            manager.preload()
            callbacks[0].onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))
            manager.preload()
            assertThat(callbacks).hasSize(1)

            // This is NOT a stale callback: the failure belonged to revision 1.
            // Revision 2 must not inherit its cooldown.
            revision = 2L
            manager.preload()
            assertThat(callbacks).hasSize(2)
        }

    @Test
    fun obsoleteConsentFailureDoesNotBackoffNewlyAllowedRequest() =
        withSdkMocks { manager ->
            manager.preload()
            revision = 2L
            callbacks[0].onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))

            assertThat(callbacks).hasSize(2)
            // New current-revision failure must still begin backoff.
            callbacks[1].onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))
            manager.preload()
            assertThat(callbacks).hasSize(2)
        }

    @Test
    fun obsoleteConsentSuccessCannotCacheCreativeAndReloadsWithCurrentPermission() =
        withSdkMocks { manager ->
            manager.preload()
            revision = 2L
            callbacks[0].onAdLoaded(mockk<RewardedInterstitialAd>(relaxed = true))
            assertThat(callbacks).hasSize(2)

            val field = RewardedInterstitialAdManager::class.java.getDeclaredField("rewardedInterstitialAd")
            field.isAccessible = true
            assertThat(field.get(manager)).isNull()

            val fresh = mockk<RewardedInterstitialAd>(relaxed = true)
            callbacks[1].onAdLoaded(fresh)
            assertThat(field.get(manager)).isSameInstanceAs(fresh)
        }
}
