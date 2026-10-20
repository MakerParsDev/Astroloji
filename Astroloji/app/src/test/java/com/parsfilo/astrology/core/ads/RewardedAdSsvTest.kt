package com.parsfilo.astrology.core.ads

import com.google.android.gms.ads.rewarded.RewardedAd
import android.app.Activity
import android.content.Context
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.OnUserEarnedRewardListener
import com.google.android.gms.ads.rewarded.RewardItem
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import io.mockk.verify
import com.google.android.gms.ads.rewarded.ServerSideVerificationOptions
import com.google.common.truth.Truth.assertThat
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.slot
import org.junit.Test

class RewardedAdSsvTest {
    @Test
    fun `closing an ad without reward callback does not grant a reward`() {
        val ad = mockk<RewardedAd>(relaxed = true)
        val activity = mockk<Activity>(relaxed = true)
        val consent = mockk<GoogleMobileAdsConsentManager>()
        every { consent.canRequestAds } returns false
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

        val shown = manager.showIfAvailable(
            activity = activity,
            request = RewardedAdRequest(
                placement = "unlock_daily_full",
                ssvUserId = "test-user",
                ssvCustomData = "test-challenge",
            ),
            onRewardEarned = { rewardCount++ },
            onDismissed = { dismissalCount++ },
        )

        assertThat(shown).isTrue()
        verify(exactly = 1) { ad.show(activity, any<OnUserEarnedRewardListener>()) }
        callback.captured.onAdDismissedFullScreenContent()
        assertThat(dismissalCount).isEqualTo(1)
        assertThat(rewardCount).isEqualTo(0)
    }

    @Test
    fun `only an SDK earned-reward callback grants a reward`() {
        val ad = mockk<RewardedAd>(relaxed = true)
        val activity = mockk<Activity>(relaxed = true)
        val consent = mockk<GoogleMobileAdsConsentManager>()
        every { consent.canRequestAds } returns false
        val manager = RewardedAdManager(
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
        assertThat(rewardCount).isEqualTo(1)
        callback.captured.onAdDismissedFullScreenContent()
        assertThat(rewardCount).isEqualTo(1)
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
