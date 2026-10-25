package com.parsfilo.astrology.core.ads

import android.content.Context
import android.os.SystemClock
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.appopen.AppOpenAd
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.slot
import io.mockk.unmockkStatic
import org.junit.Test

class AppOpenAdManagerLoadTimeTest {
    @Test
    fun loadedAdUsesMonotonicTimeAndExpiresExactlyAtFourHours() {
        val context = mockk<Context>(relaxed = true)
        val consent = mockk<GoogleMobileAdsConsentManager>()
        every { consent.canRequestAds } returns true
        val ad = mockk<AppOpenAd>(relaxed = true)
        val callback = slot<AppOpenAd.AppOpenAdLoadCallback>()
        val manager =
            AppOpenAdManager(
                context,
                consent,
                mockk<AnalyticsRepository>(relaxed = true),
            )
        mockkStatic(AppOpenAd::class)
        mockkStatic(SystemClock::class)
        try {
            every { SystemClock.elapsedRealtime() } returns 10_000L
            every { AppOpenAd.load(any<Context>(), any<String>(), any<AdRequest>(), capture(callback)) } just Runs
            manager.preload()
            callback.captured.onAdLoaded(ad)

            val availableMethod = AppOpenAdManager::class.java.getDeclaredMethod("isAdAvailable")
            availableMethod.isAccessible = true
            assertThat(availableMethod.invoke(manager)).isEqualTo(true)

            every { SystemClock.elapsedRealtime() } returns 10_000L + APP_OPEN_AD_TTL_MS - 1L
            assertThat(availableMethod.invoke(manager)).isEqualTo(true)

            every { SystemClock.elapsedRealtime() } returns 10_000L + APP_OPEN_AD_TTL_MS
            assertThat(availableMethod.invoke(manager)).isEqualTo(false)
        } finally {
            unmockkStatic(AppOpenAd::class)
            unmockkStatic(SystemClock::class)
        }
    }
}
