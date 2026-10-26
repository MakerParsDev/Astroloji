package com.parsfilo.astrology.core.ads

import android.app.Activity
import android.content.Context
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.OnUserEarnedRewardListener
import com.google.android.gms.ads.rewarded.RewardItem
import com.google.android.gms.ads.rewarded.RewardedAd
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

class RewardedAdLifecycleAnalyticsTest {
    private class Fixture {
        val activity = mockk<Activity>(relaxed = true)
        val consent = mockk<GoogleMobileAdsConsentManager>()
        val analytics = mockk<AnalyticsRepository>(relaxed = true)
        val ad = mockk<RewardedAd>(relaxed = true)
        val callback = slot<FullScreenContentCallback>()
        val earnedCallback = slot<OnUserEarnedRewardListener>()
        val manager = RewardedAdManager(mockk<Context>(relaxed = true), consent, analytics)
        val request =
            RewardedAdRequest(
                placement = "unlock_daily_full",
                ssvUserId = "synthetic-user",
                ssvCustomData = "synthetic-challenge",
            )

        init {
            // No SDK network preload after dismissal.
            every { consent.canRequestAds } returnsMany listOf(true, false)
            every { ad.fullScreenContentCallback = capture(callback) } just Runs
            every { ad.show(activity, capture(earnedCallback)) } just Runs
            RewardedAdManager::class.java.getDeclaredField("rewardedAd").apply {
                isAccessible = true
                set(manager, ad)
            }
        }

        fun show(
            onRewardEarned: (RewardItem) -> Unit = {},
            onDismissed: () -> Unit = {},
        ) = manager.showIfAvailable(activity, request, onRewardEarned, onDismissed)

        val meta = mapOf("format" to "rewarded", "placement" to "unlock_daily_full")
    }

    @Test
    fun `an earned callback records one SDK completion without any SSV success claim`() {
        val f = Fixture()
        var earned = 0
        var dismissed = 0
        assertThat(f.show(onRewardEarned = { earned++ }, onDismissed = { dismissed++ })).isTrue()

        f.callback.captured.onAdShowedFullScreenContent()
        f.callback.captured.onAdShowedFullScreenContent()
        f.earnedCallback.captured.onUserEarnedReward(mockk(relaxed = true))
        f.earnedCallback.captured.onUserEarnedReward(mockk(relaxed = true))
        f.callback.captured.onAdDismissedFullScreenContent()
        f.callback.captured.onAdDismissedFullScreenContent()

        assertThat(earned).isEqualTo(1)
        assertThat(dismissed).isEqualTo(1)
        coVerify(exactly = 1, timeout = 3000) {
            f.analytics.track(AnalyticsEvents.REWARDED_AD_STARTED, f.meta)
        }
        coVerify(exactly = 1, timeout = 3000) {
            f.analytics.track(
                AnalyticsEvents.REWARDED_AD_COMPLETED,
                f.meta + ("reason" to "sdk_reward_callback"),
            )
        }
        coVerify(exactly = 0) { f.analytics.track(AnalyticsEvents.REWARDED_AD_FAILED, any()) }
        verify(exactly = 1) { f.ad.show(f.activity, any<OnUserEarnedRewardListener>()) }
    }

    @Test
    fun `dismissal without reward records failure and ignores late rewards`() {
        val f = Fixture()
        var earned = 0
        assertThat(f.show(onRewardEarned = { earned++ })).isTrue()

        f.callback.captured.onAdShowedFullScreenContent()
        f.callback.captured.onAdDismissedFullScreenContent()
        f.callback.captured.onAdDismissedFullScreenContent()
        f.earnedCallback.captured.onUserEarnedReward(mockk(relaxed = true))

        assertThat(earned).isEqualTo(0)
        coVerify(exactly = 1, timeout = 3000) {
            f.analytics.track(
                AnalyticsEvents.REWARDED_AD_FAILED,
                f.meta + ("reason" to "dismissed_without_reward"),
            )
        }
        coVerify(exactly = 0) { f.analytics.track(AnalyticsEvents.REWARDED_AD_COMPLETED, any()) }
    }

    @Test
    fun `SDK failure to show reports a single failure without a completed ad`() {
        val f = Fixture()
        var dismissed = 0
        assertThat(f.show(onDismissed = { dismissed++ })).isTrue()

        f.callback.captured.onAdFailedToShowFullScreenContent(mockk<AdError>(relaxed = true))
        f.callback.captured.onAdDismissedFullScreenContent()
        f.callback.captured.onAdShowedFullScreenContent()

        assertThat(dismissed).isEqualTo(1)
        coVerify(exactly = 1, timeout = 3000) {
            f.analytics.track(AnalyticsEvents.REWARDED_AD_FAILED, f.meta + ("reason" to "show_failed"))
        }
        coVerify(exactly = 0) { f.analytics.track(AnalyticsEvents.REWARDED_AD_STARTED, any()) }
        coVerify(exactly = 0) { f.analytics.track(AnalyticsEvents.REWARDED_AD_COMPLETED, any()) }
    }

    @Test
    fun `synchronous SDK show exception leaves fallback to caller and reports failure once`() {
        val f = Fixture()
        every { f.ad.show(f.activity, any<OnUserEarnedRewardListener>()) } throws IllegalStateException("synthetic")
        var dismissed = 0
        assertThat(f.show(onDismissed = { dismissed++ })).isFalse()

        f.callback.captured.onAdFailedToShowFullScreenContent(mockk<AdError>(relaxed = true))
        f.callback.captured.onAdDismissedFullScreenContent()

        assertThat(dismissed).isEqualTo(0)
        coVerify(exactly = 1, timeout = 3000) {
            f.analytics.track(AnalyticsEvents.REWARDED_AD_FAILED, f.meta + ("reason" to "show_exception"))
        }
        coVerify(exactly = 0) { f.analytics.track(AnalyticsEvents.REWARDED_AD_COMPLETED, any()) }
    }

    @Test
    fun `revoked consent causes no ad display or lifecycle analytics`() {
        val f = Fixture()
        every { f.consent.canRequestAds } returns false

        assertThat(f.show()).isFalse()
        verify(exactly = 0) { f.ad.show(any<Activity>(), any<OnUserEarnedRewardListener>()) }
        coVerify(exactly = 0) { f.analytics.track(any(), any()) }
    }
}
