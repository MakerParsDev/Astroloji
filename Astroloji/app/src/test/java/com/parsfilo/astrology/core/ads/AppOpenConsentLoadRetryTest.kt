package com.parsfilo.astrology.core.ads

import android.content.Context
import android.os.SystemClock
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.appopen.AppOpenAd
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.unmockkStatic
import org.junit.Test

/** App-open ads must retry only against the current allowed UMP decision. */
class AppOpenConsentLoadRetryTest {
    private val context = mockk<Context>(relaxed = true)
    private val consent = mockk<GoogleMobileAdsConsentManager>(relaxed = true)
    private val analytics = mockk<AnalyticsRepository>(relaxed = true)
    private var revision = 1L
    private var allowed = true
    private var now = 10_000L

    private fun withLoad(block: (AppOpenAdManager, MutableList<AppOpenAd.AppOpenAdLoadCallback>) -> Unit) {
        val callbacks = mutableListOf<AppOpenAd.AppOpenAdLoadCallback>()
        mockkStatic(SystemClock::class)
        mockkStatic(AppOpenAd::class)
        try {
            every { SystemClock.elapsedRealtime() } answers { now }
            every { consent.consentRevision } answers { revision }
            every { consent.canRequestAds } answers { allowed }
            every { AppOpenAd.load(any<Context>(), any<String>(), any<AdRequest>(), capture(callbacks)) } just Runs
            block(AppOpenAdManager(context, consent, analytics), callbacks)
        } finally {
            unmockkStatic(AppOpenAd::class)
            unmockkStatic(SystemClock::class)
        }
    }

    @Test
    fun staleSuccessReloadsUnderNewlyAllowedConsent() =
        withLoad { manager, callbacks ->
            manager.preload()
            revision = 2L
            callbacks[0].onAdLoaded(mockk(relaxed = true))
            assertThat(callbacks).hasSize(2)
            val fresh = mockk<AppOpenAd>(relaxed = true)
            callbacks[1].onAdLoaded(fresh)
            val adField = AppOpenAdManager::class.java.getDeclaredField("appOpenAd")
            adField.isAccessible = true
            assertThat(adField.get(manager)).isSameInstanceAs(fresh)
        }

    @Test
    fun staleFailureReloadsWithoutImposingBackoff() =
        withLoad { manager, callbacks ->
            manager.preload()
            revision = 2L
            callbacks[0].onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))
            assertThat(callbacks).hasSize(2)
        }

    @Test
    fun earlierFailureBackoffDoesNotBlockNewConsentRevision() =
        withLoad { manager, callbacks ->
            manager.preload()
            callbacks[0].onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))
            manager.preload()
            assertThat(callbacks).hasSize(1)
            revision = 2L
            manager.preload()
            assertThat(callbacks).hasSize(2)
            callbacks[1].onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))
            manager.preload()
            assertThat(callbacks).hasSize(2) // A real failure under current consent still backs off.
        }

    @Test
    fun revokedConsentNeverStartsAnObsoleteReplacementLoad() =
        withLoad { manager, callbacks ->
            manager.preload()
            revision = 2L
            allowed = false
            callbacks[0].onAdFailedToLoad(mockk<LoadAdError>(relaxed = true))
            manager.preload()
            assertThat(callbacks).hasSize(1)
            allowed = true
            manager.preload()
            assertThat(callbacks).hasSize(2)
        }
}
