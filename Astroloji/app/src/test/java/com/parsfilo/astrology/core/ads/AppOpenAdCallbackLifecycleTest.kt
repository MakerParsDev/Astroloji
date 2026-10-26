package com.parsfilo.astrology.core.ads

import android.app.Activity
import android.content.Context
import android.os.SystemClock
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.appopen.AppOpenAd
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import io.mockk.Runs
import io.mockk.coVerify
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.slot
import io.mockk.unmockkStatic
import io.mockk.verify
import org.junit.Test

class AppOpenAdCallbackLifecycleTest {
    private class Fixture {
        val activity = mockk<Activity>(relaxed = true)
        val consent = mockk<GoogleMobileAdsConsentManager>()
        val analytics = mockk<AnalyticsRepository>(relaxed = true)
        val ad = mockk<AppOpenAd>(relaxed = true)
        val callback = slot<FullScreenContentCallback>()
        val manager = AppOpenAdManager(mockk<Context>(relaxed = true), consent, analytics)

        init {
            every { activity.isFinishing } returns false
            every { activity.isDestroyed } returns false
            every { activity.hasWindowFocus() } returns true
            // Initial permission to show; revoked before callbacks so a real
            // Google SDK preload cannot start during this isolated JVM test.
            every { consent.canRequestAds } returnsMany listOf(true, false)
            every { ad.fullScreenContentCallback = capture(callback) } just Runs
            every { ad.show(activity) } just Runs
            AppOpenAdManager::class.java.getDeclaredField("appOpenAd").apply {
                isAccessible = true
                set(manager, ad)
            }
            AppOpenAdManager::class.java.getDeclaredField("loadElapsedRealtimeMs").apply {
                isAccessible = true
                setLong(manager, 10_000L)
            }
        }

        fun isShowing(): Boolean =
            AppOpenAdManager::class.java.getDeclaredField("isShowing").let { field ->
                field.isAccessible = true
                field.getBoolean(manager)
            }
    }

    private fun withFixture(block: (Fixture) -> Unit) {
        mockkStatic(SystemClock::class)
        mockkStatic(AppOpenAd::class)
        try {
            every { SystemClock.elapsedRealtime() } returns 10_001L
            // A restored consent state may start a fresh preload. Do not
            // launch the real Google SDK in this deterministic JVM test.
            every {
                AppOpenAd.load(
                    any<Context>(),
                    any<String>(),
                    any<AdRequest>(),
                    any<AppOpenAd.AppOpenAdLoadCallback>(),
                )
            } just Runs
            block(Fixture())
        } finally {
            unmockkStatic(AppOpenAd::class)
            unmockkStatic(SystemClock::class)
        }
    }

    @Test
    fun `dismissal and failed-show callbacks navigate only once`() =
        withFixture { f ->
            var dismissed = 0
            assertThat(f.manager.showIfAvailable(f.activity) { dismissed++ }).isTrue()
            assertThat(f.isShowing()).isTrue()

            f.callback.captured.onAdDismissedFullScreenContent()
            f.callback.captured.onAdDismissedFullScreenContent()
            f.callback.captured.onAdFailedToShowFullScreenContent(mockk<AdError>(relaxed = true))
            f.callback.captured.onAdImpression()

            assertThat(dismissed).isEqualTo(1)
            assertThat(f.isShowing()).isFalse()
            coVerify(exactly = 0) { f.analytics.track(any(), any()) }
            verify(exactly = 1) { f.ad.show(f.activity) }
        }

    @Test
    fun `an SDK impression is tracked only once and never after dismissal`() =
        withFixture { f ->
            assertThat(f.manager.showIfAvailable(f.activity, "home_resume")).isTrue()
            f.callback.captured.onAdImpression()
            f.callback.captured.onAdImpression()

            coVerify(exactly = 1, timeout = 3000) {
                f.analytics.track(
                    AnalyticsEvents.AD_SHOWN,
                    mapOf("format" to "app_open", "placement" to "home_resume"),
                )
            }
            f.callback.captured.onAdDismissedFullScreenContent()
            f.callback.captured.onAdImpression()
            coVerify(exactly = 1) { f.analytics.track(any(), any()) }
        }

    @Test
    fun `synchronous SDK show exception is handled and a late callback is ignored`() =
        withFixture { f ->
            every { f.ad.show(f.activity) } throws IllegalStateException("synthetic SDK failure")
            var dismissed = 0

            assertThat(f.manager.showIfAvailable(f.activity) { dismissed++ }).isFalse()
            f.callback.captured.onAdFailedToShowFullScreenContent(mockk<AdError>(relaxed = true))
            f.callback.captured.onAdDismissedFullScreenContent()
            f.callback.captured.onAdImpression()

            assertThat(dismissed).isEqualTo(1)
            assertThat(f.isShowing()).isFalse()
            coVerify(exactly = 0) { f.analytics.track(any(), any()) }
        }

    @Test
    fun `SDK terminal callback then show exception does not notify the host twice`() =
        withFixture { f ->
            every { f.ad.show(f.activity) } answers {
                f.callback.captured.onAdFailedToShowFullScreenContent(mockk<AdError>(relaxed = true))
                error("synthetic exception after callback")
            }
            var dismissed = 0

            // True here means the callback already handled the terminal state.
            assertThat(f.manager.showIfAvailable(f.activity) { dismissed++ }).isTrue()
            f.callback.captured.onAdDismissedFullScreenContent()

            assertThat(dismissed).isEqualTo(1)
            assertThat(f.isShowing()).isFalse()
            coVerify(exactly = 0) { f.analytics.track(any(), any()) }
        }

    @Test
    fun `preloaded app open ad cannot show after consent revocation`() =
        withFixture { f ->
            every { f.consent.canRequestAds } returns false

            assertThat(f.manager.showIfAvailable(f.activity)).isFalse()
            // A later consent grant must never resurrect the old loaded ad.
            every { f.consent.canRequestAds } returns true
            assertThat(f.manager.showIfAvailable(f.activity)).isFalse()
            verify(exactly = 0) { f.ad.show(any()) }
            coVerify(exactly = 0) { f.analytics.track(any(), any()) }
        }
}
