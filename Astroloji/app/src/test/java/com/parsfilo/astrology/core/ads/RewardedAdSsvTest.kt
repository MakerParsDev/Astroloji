package com.parsfilo.astrology.core.ads

import android.app.Activity
import android.content.Context
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.OnUserEarnedRewardListener
import com.google.android.gms.ads.rewarded.RewardItem
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.ServerSideVerificationOptions
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.junit.Test

class RewardedAdSsvTest {
    @Test
    fun `closing an ad without reward callback does not grant a reward`() {
        val ad = mockk<RewardedAd>(relaxed = true)
        val activity = mockk<Activity>(relaxed = true)
        val consent = mockk<GoogleMobileAdsConsentManager>()
        every { consent.canRequestAds } returns true
        val analytics = mockk<AnalyticsRepository>(relaxed = true)
        val manager = RewardedAdManager(mockk<Context>(relaxed = true), consent, analytics)
        val callback = slot<FullScreenContentCallback>()
        val rewardListener = slot<OnUserEarnedRewardListener>()
        every { ad.fullScreenContentCallback = capture(callback) } just Runs
        every { ad.show(activity, capture(rewardListener)) } just Runs
        RewardedAdManager::class.java.getDeclaredField("rewardedAd").apply {
            isAccessible = true
            set(manager, ad)
        }
        var rewardCount = 0
        var dismissalCount = 0

        val shown =
            manager.showIfAvailable(
                activity = activity,
                request =
                    RewardedAdRequest(
                        placement = "unlock_daily_full",
                        ssvUserId = "test-user",
                        ssvCustomData = "test-challenge",
                    ),
                onRewardEarned = { rewardCount++ },
                onDismissed = { dismissalCount++ },
            )

        assertThat(shown).isTrue()
        verify(exactly = 1) { ad.show(activity, any<OnUserEarnedRewardListener>()) }
        // Prevent a fresh SDK load in this JVM-only lifecycle test.
        every { consent.canRequestAds } returns false
        callback.captured.onAdDismissedFullScreenContent()
        assertThat(dismissalCount).isEqualTo(1)
        assertThat(rewardCount).isEqualTo(0)
    }

    @Test
    fun `failed to show an ad dismisses safely without granting any reward`() {
        val ad = mockk<RewardedAd>(relaxed = true)
        val activity = mockk<Activity>(relaxed = true)
        val consent = mockk<GoogleMobileAdsConsentManager>()
        every { consent.canRequestAds } returns true
        val manager =
            RewardedAdManager(
                mockk<Context>(relaxed = true),
                consent,
                mockk<AnalyticsRepository>(relaxed = true),
            )
        val callback = slot<FullScreenContentCallback>()
        every { ad.fullScreenContentCallback = capture(callback) } just Runs
        every { ad.show(activity, any<OnUserEarnedRewardListener>()) } just Runs
        RewardedAdManager::class.java.getDeclaredField("rewardedAd").apply {
            isAccessible = true
            set(manager, ad)
        }
        var rewardCount = 0
        var dismissedCount = 0

        assertThat(
            manager.showIfAvailable(
                activity = activity,
                request = RewardedAdRequest("unlock_daily_full", "test-user", "test-challenge"),
                onRewardEarned = { rewardCount++ },
                onDismissed = { dismissedCount++ },
            ),
        ).isTrue()

        // A show failure has no earned-reward callback, so it must never
        // trigger a claim. Revoke consent to avoid a real SDK preload.
        every { consent.canRequestAds } returns false
        callback.captured.onAdFailedToShowFullScreenContent(mockk<AdError>(relaxed = true))

        assertThat(dismissedCount).isEqualTo(1)
        assertThat(rewardCount).isEqualTo(0)
        verify(exactly = 1) { ad.show(activity, any<OnUserEarnedRewardListener>()) }
    }

    @Test
    fun `synchronous SDK show exception leaves fallback to caller without earning reward`() {
        val ad = mockk<RewardedAd>(relaxed = true)
        val activity = mockk<Activity>(relaxed = true)
        val consent = mockk<GoogleMobileAdsConsentManager>()
        every { consent.canRequestAds } returnsMany listOf(true, false)
        val manager =
            RewardedAdManager(
                mockk<Context>(relaxed = true),
                consent,
                mockk<AnalyticsRepository>(relaxed = true),
            )
        val callback = slot<FullScreenContentCallback>()
        val rewardListener = slot<OnUserEarnedRewardListener>()
        every { ad.fullScreenContentCallback = capture(callback) } just Runs
        every { ad.show(activity, capture(rewardListener)) } throws
            IllegalStateException("synthetic SDK show failure")
        RewardedAdManager::class.java.getDeclaredField("rewardedAd").apply {
            isAccessible = true
            set(manager, ad)
        }
        var rewardCount = 0
        var dismissedCount = 0

        assertThat(
            manager.showIfAvailable(
                activity,
                RewardedAdRequest("unlock_daily_full", "synthetic-user", "synthetic-challenge"),
                onRewardEarned = { rewardCount++ },
                onDismissed = { dismissedCount++ },
            ),
        ).isFalse()
        assertThat(dismissedCount).isEqualTo(0)
        assertThat(rewardCount).isEqualTo(0)

        callback.captured.onAdFailedToShowFullScreenContent(mockk<AdError>(relaxed = true))
        callback.captured.onAdDismissedFullScreenContent()
        // After false, the caller owns the failure UI. Malformed late
        // callbacks must neither dismiss nor grant a reward.
        rewardListener.captured.onUserEarnedReward(mockk<RewardItem>(relaxed = true))
        assertThat(dismissedCount).isEqualTo(0)
        assertThat(rewardCount).isEqualTo(0)
        verify(exactly = 1) { ad.show(activity, any<OnUserEarnedRewardListener>()) }
    }

    @Test
    fun `terminal SDK callback before show exception owns dismissal exactly once`() {
        val ad = mockk<RewardedAd>(relaxed = true)
        val activity = mockk<Activity>(relaxed = true)
        val consent = mockk<GoogleMobileAdsConsentManager>()
        every { consent.canRequestAds } returnsMany listOf(true, false)
        val manager =
            RewardedAdManager(
                mockk<Context>(relaxed = true),
                consent,
                mockk<AnalyticsRepository>(relaxed = true),
            )
        val callback = slot<FullScreenContentCallback>()
        every { ad.fullScreenContentCallback = capture(callback) } just Runs
        every { ad.show(activity, any<OnUserEarnedRewardListener>()) } answers {
            callback.captured.onAdFailedToShowFullScreenContent(mockk<AdError>(relaxed = true))
            error("synthetic show exception after terminal callback")
        }
        RewardedAdManager::class.java.getDeclaredField("rewardedAd").apply {
            isAccessible = true
            set(manager, ad)
        }
        var rewards = 0
        var dismissed = 0

        assertThat(
            manager.showIfAvailable(
                activity,
                RewardedAdRequest("unlock_weekly_full", "test-user", "test-challenge"),
                onRewardEarned = { rewards++ },
                onDismissed = { dismissed++ },
            ),
        ).isTrue()
        callback.captured.onAdDismissedFullScreenContent()
        assertThat(dismissed).isEqualTo(1)
        assertThat(rewards).isEqualTo(0)
    }

    @Test
    fun `earned callback before SDK show exception preserves pending SSV path`() {
        val ad = mockk<RewardedAd>(relaxed = true)
        val activity = mockk<Activity>(relaxed = true)
        val consent = mockk<GoogleMobileAdsConsentManager>()
        every { consent.canRequestAds } returnsMany listOf(true, false)
        val manager =
            RewardedAdManager(
                mockk<Context>(relaxed = true),
                consent,
                mockk<AnalyticsRepository>(relaxed = true),
            )
        val listener = slot<OnUserEarnedRewardListener>()
        val callback = slot<FullScreenContentCallback>()
        every { ad.fullScreenContentCallback = capture(callback) } just Runs
        every { ad.show(activity, capture(listener)) } answers {
            listener.captured.onUserEarnedReward(mockk<RewardItem>(relaxed = true))
            error("synthetic exception after earned callback")
        }
        RewardedAdManager::class.java.getDeclaredField("rewardedAd").apply {
            isAccessible = true
            set(manager, ad)
        }
        var rewards = 0
        var dismissed = 0

        assertThat(
            manager.showIfAvailable(
                activity,
                RewardedAdRequest("unlock_daily_full", "test-user", "test-challenge"),
                onRewardEarned = { rewards++ },
                onDismissed = { dismissed++ },
            ),
        ).isTrue()
        assertThat(rewards).isEqualTo(1)
        assertThat(dismissed).isEqualTo(0)
        listener.captured.onUserEarnedReward(mockk<RewardItem>(relaxed = true))
        callback.captured.onAdDismissedFullScreenContent()
        assertThat(rewards).isEqualTo(1)
        assertThat(dismissed).isEqualTo(0)
    }

    @Test
    fun `only an SDK earned-reward callback grants a reward`() {
        val ad = mockk<RewardedAd>(relaxed = true)
        val activity = mockk<Activity>(relaxed = true)
        val consent = mockk<GoogleMobileAdsConsentManager>()
        every { consent.canRequestAds } returns true
        val manager =
            RewardedAdManager(
                mockk<Context>(relaxed = true),
                consent,
                mockk<AnalyticsRepository>(relaxed = true),
            )
        val callback = slot<FullScreenContentCallback>()
        val rewardListener = slot<OnUserEarnedRewardListener>()
        every { ad.fullScreenContentCallback = capture(callback) } just Runs
        every { ad.show(activity, capture(rewardListener)) } just Runs
        RewardedAdManager::class.java.getDeclaredField("rewardedAd").apply {
            isAccessible = true
            set(manager, ad)
        }
        val reward = mockk<RewardItem>()
        var rewardCount = 0

        assertThat(
            manager.showIfAvailable(
                activity = activity,
                request = RewardedAdRequest("unlock_weekly_full", "test-user", "test-challenge"),
                onRewardEarned = { rewardCount++ },
            ),
        ).isTrue()
        assertThat(rewardCount).isEqualTo(0)
        rewardListener.captured.onUserEarnedReward(reward)
        rewardListener.captured.onUserEarnedReward(reward)
        assertThat(rewardCount).isEqualTo(1)
        // Simulate consent changing before the automatic next preload.
        every { consent.canRequestAds } returns false
        callback.captured.onAdDismissedFullScreenContent()
        rewardListener.captured.onUserEarnedReward(reward)
        assertThat(rewardCount).isEqualTo(1)
    }

    @Test
    fun `earned callback after dismissal without prior reward is rejected`() {
        val ad = mockk<RewardedAd>(relaxed = true)
        val activity = mockk<Activity>(relaxed = true)
        val consent = mockk<GoogleMobileAdsConsentManager>()
        every { consent.canRequestAds } returnsMany listOf(true, false)
        val manager =
            RewardedAdManager(
                mockk<Context>(relaxed = true),
                consent,
                mockk<AnalyticsRepository>(relaxed = true),
            )
        val callback = slot<FullScreenContentCallback>()
        val rewardListener = slot<OnUserEarnedRewardListener>()
        every { ad.fullScreenContentCallback = capture(callback) } just Runs
        every { ad.show(activity, capture(rewardListener)) } just Runs
        RewardedAdManager::class.java.getDeclaredField("rewardedAd").apply {
            isAccessible = true
            set(manager, ad)
        }
        var rewards = 0

        assertThat(
            manager.showIfAvailable(
                activity,
                RewardedAdRequest("unlock_daily_full", "test-user", "test-challenge"),
                onRewardEarned = { rewards++ },
            ),
        ).isTrue()
        callback.captured.onAdDismissedFullScreenContent()
        rewardListener.captured.onUserEarnedReward(mockk<RewardItem>(relaxed = true))
        assertThat(rewards).isEqualTo(0)
    }

    @Test
    fun `SSV configuration failure prevents ad showing or granting rewards`() {
        val ad = mockk<RewardedAd>(relaxed = true)
        val activity = mockk<Activity>(relaxed = true)
        val consent = mockk<GoogleMobileAdsConsentManager>()
        every { consent.canRequestAds } returnsMany listOf(true, false)
        every { ad.setServerSideVerificationOptions(any()) } throws
            IllegalStateException("synthetic SSV configuration error")
        val manager =
            RewardedAdManager(
                mockk<Context>(relaxed = true),
                consent,
                mockk<AnalyticsRepository>(relaxed = true),
            )
        RewardedAdManager::class.java.getDeclaredField("rewardedAd").apply {
            isAccessible = true
            set(manager, ad)
        }
        var rewards = 0

        assertThat(
            manager.showIfAvailable(
                activity,
                RewardedAdRequest("unlock_daily_full", "test-user", "test-challenge"),
                onRewardEarned = { rewards++ },
            ),
        ).isFalse()
        assertThat(rewards).isEqualTo(0)
        verify(exactly = 0) { ad.show(any<Activity>(), any<OnUserEarnedRewardListener>()) }
    }

    @Test
    fun revokedConsentDiscardsPreloadedAdWithoutRewardOrSsvSetup() {
        val ad = mockk<RewardedAd>(relaxed = true)
        val activity = mockk<Activity>(relaxed = true)
        val consent = mockk<GoogleMobileAdsConsentManager>()
        every { consent.canRequestAds } returns false
        val manager =
            RewardedAdManager(
                mockk<Context>(relaxed = true),
                consent,
                mockk<AnalyticsRepository>(relaxed = true),
            )
        RewardedAdManager::class.java.getDeclaredField("rewardedAd").apply {
            isAccessible = true
            set(manager, ad)
        }
        var rewardCount = 0

        val shown =
            manager.showIfAvailable(
                activity,
                RewardedAdRequest("unlock_daily_full", "test-user", "test-challenge"),
                onRewardEarned = { rewardCount++ },
            )

        assertThat(shown).isFalse()
        assertThat(rewardCount).isEqualTo(0)
        verify(exactly = 0) { ad.show(any<Activity>(), any<OnUserEarnedRewardListener>()) }
        verify(exactly = 0) { ad.setServerSideVerificationOptions(any()) }
        val cachedAdField = RewardedAdManager::class.java.getDeclaredField("rewardedAd")
        cachedAdField.isAccessible = true
        assertThat(cachedAdField.get(manager)).isNull()
    }

    @Test
    fun `applies backend user and challenge to the rewarded ad`() {
        val ad = mockk<RewardedAd>()
        val options = slot<ServerSideVerificationOptions>()
        every { ad.setServerSideVerificationOptions(capture(options)) } just Runs

        applyRewardSsvOptions(
            ad = ad,
            userId = "user-1",
            customData = "challenge-1",
        )

        assertThat(options.captured.userId).isEqualTo("user-1")
        assertThat(options.captured.customData).isEqualTo("challenge-1")
    }
}
