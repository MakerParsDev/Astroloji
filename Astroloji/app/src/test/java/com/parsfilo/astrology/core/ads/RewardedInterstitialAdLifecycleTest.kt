package com.parsfilo.astrology.core.ads

import android.app.Activity
import android.content.Context
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.OnUserEarnedRewardListener
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAd
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import io.mockk.Runs
import io.mockk.coVerify
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.junit.Test

class RewardedInterstitialAdLifecycleTest {
    private class Fixture {
        val activity = mockk<Activity>(relaxed = true)
        val consent = mockk<GoogleMobileAdsConsentManager>(relaxed = true)
        val analytics = mockk<AnalyticsRepository>(relaxed = true)
        val ad = mockk<RewardedInterstitialAd>(relaxed = true)
        val callback = slot<FullScreenContentCallback>()
        val manager =
            RewardedInterstitialAdManager(
                mockk<Context>(relaxed = true),
                consent,
                analytics,
            )

        init {
            every { consent.canRequestAds } returnsMany listOf(true, false)
            every { ad.fullScreenContentCallback = capture(callback) } just Runs
            every { ad.show(activity, any<OnUserEarnedRewardListener>()) } just Runs
            RewardedInterstitialAdManager::class.java.getDeclaredField("rewardedInterstitialAd").apply {
                isAccessible = true
                set(manager, ad)
            }
            RewardedInterstitialAdManager::class.java.getDeclaredField("loadedConsentRevision").apply {
                isAccessible = true
                setLong(manager, consent.consentRevision)
            }
        }

        fun cachedAd(): Any? =
            RewardedInterstitialAdManager::class.java.getDeclaredField("rewardedInterstitialAd").let { field ->
                field.isAccessible = true
                field.get(manager)
            }
    }

    @Test
    fun `revoked consent discards cached interstitial without showing it`() {
        val fixture = Fixture()
        every { fixture.consent.canRequestAds } returns false

        assertThat(fixture.manager.showIfAvailable(fixture.activity, "weekly_back")).isFalse()
        assertThat(fixture.cachedAd()).isNull()
        verify(exactly = 0) { fixture.ad.show(any<Activity>(), any<OnUserEarnedRewardListener>()) }
        coVerify(exactly = 0) { fixture.analytics.track(any(), any()) }
    }

    @Test
    fun `terminal callbacks only dismiss once and late impressions are ignored`() {
        val fixture = Fixture()
        var dismissed = 0

        assertThat(fixture.manager.showIfAvailable(fixture.activity, "weekly_back") { dismissed++ }).isTrue()
        fixture.callback.captured.onAdDismissedFullScreenContent()
        fixture.callback.captured.onAdFailedToShowFullScreenContent(mockk<AdError>(relaxed = true))
        fixture.callback.captured.onAdDismissedFullScreenContent()
        fixture.callback.captured.onAdImpression()

        assertThat(dismissed).isEqualTo(1)
        coVerify(exactly = 0) { fixture.analytics.track(any(), any()) }
        verify(exactly = 1) { fixture.ad.show(fixture.activity, any<OnUserEarnedRewardListener>()) }
    }

    @Test
    fun `duplicate impression callbacks log one event`() {
        val fixture = Fixture()

        assertThat(fixture.manager.showIfAvailable(fixture.activity, "monthly_back")).isTrue()
        fixture.callback.captured.onAdImpression()
        fixture.callback.captured.onAdImpression()

        coVerify(exactly = 1, timeout = 3000) {
            fixture.analytics.track(
                AnalyticsEvents.AD_SHOWN,
                mapOf("format" to "rewarded_interstitial", "placement" to "monthly_back"),
            )
        }
        fixture.callback.captured.onAdDismissedFullScreenContent()
        fixture.callback.captured.onAdImpression()
        coVerify(exactly = 1) { fixture.analytics.track(any(), any()) }
    }

    @Test
    fun `synchronous SDK failure returns false and ignores late callbacks`() {
        val fixture = Fixture()
        every {
            fixture.ad.show(fixture.activity, any<OnUserEarnedRewardListener>())
        } throws IllegalStateException("synthetic SDK show exception")
        var dismissed = 0

        assertThat(fixture.manager.showIfAvailable(fixture.activity, "weekly_back") { dismissed++ }).isFalse()
        fixture.callback.captured.onAdFailedToShowFullScreenContent(mockk<AdError>(relaxed = true))
        fixture.callback.captured.onAdDismissedFullScreenContent()
        fixture.callback.captured.onAdImpression()

        // A false return delegates fallback navigation to the caller.
        // A late SDK callback must not notify that same caller again.
        assertThat(dismissed).isEqualTo(0)
        coVerify(exactly = 0) { fixture.analytics.track(any(), any()) }
    }

    @Test
    fun `terminal callback before synchronous show exception is handled once`() {
        val fixture = Fixture()
        every {
            fixture.ad.show(fixture.activity, any<OnUserEarnedRewardListener>())
        } answers {
            fixture.callback.captured.onAdFailedToShowFullScreenContent(mockk<AdError>(relaxed = true))
            error("synthetic SDK exception after callback")
        }
        var dismissed = 0

        // true means the callback already owns navigation.
        assertThat(fixture.manager.showIfAvailable(fixture.activity, "monthly_back") { dismissed++ }).isTrue()
        fixture.callback.captured.onAdDismissedFullScreenContent()
        fixture.callback.captured.onAdImpression()

        assertThat(dismissed).isEqualTo(1)
        coVerify(exactly = 0) { fixture.analytics.track(any(), any()) }
    }
}
