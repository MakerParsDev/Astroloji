package com.parsfilo.astrology.core.ads

import android.app.Activity
import android.content.Context
import android.os.SystemClock
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.appopen.AppOpenAd
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.domain.model.UserPreferences
import io.mockk.Runs
import io.mockk.coEvery
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.slot
import io.mockk.unmockkStatic
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import org.junit.Rule
import org.junit.Test

/** An already-shown ad must not request the next creative after Premium takes effect. */
@OptIn(ExperimentalCoroutinesApi::class)
class PremiumAdReloadEligibilityTest {
    @get:Rule val mainDispatcherRule = MainDispatcherRule(UnconfinedTestDispatcher())

    private val context = mockk<Context>(relaxed = true)
    private val activity = mockk<Activity>(relaxed = true)
    private val consent = mockk<GoogleMobileAdsConsentManager>(relaxed = true)
    private val analytics = mockk<AnalyticsRepository>(relaxed = true)
    private val preferences = mockk<UserPreferencesRepository>(relaxed = true)
    private val eligibility = AdEligibilityChecker(preferences, consent)

    private var premium = false

    private fun premiumAfterShow() {
        premium = false
        every { consent.canRequestAds } returns true
        every { consent.consentRevision } returns 0L
        coEvery { preferences.current() } coAnswers { UserPreferences(isPremium = premium) }
    }

    @Test
    fun appOpenDismissalDoesNotReloadAfterPremiumActivation() = assertAppOpenReloadAfterDismissal(becomesPremium = true)

    @Test
    fun appOpenDismissalReloadsWhenUserRemainsFree() = assertAppOpenReloadAfterDismissal(becomesPremium = false)

    private fun assertAppOpenReloadAfterDismissal(becomesPremium: Boolean) {
        premiumAfterShow()
        mockkStatic(AppOpenAd::class)
        mockkStatic(SystemClock::class)
        try {
            every { SystemClock.elapsedRealtime() } returns 10_001L
            every { activity.isFinishing } returns false
            every { activity.isDestroyed } returns false
            every { activity.hasWindowFocus() } returns true
            every { AppOpenAd.load(any<Context>(), any<String>(), any<AdRequest>(), any()) } just Runs
            val manager = AppOpenAdManager(context, consent, analytics, eligibility)
            val ad = mockk<AppOpenAd>(relaxed = true)
            val callbacks = slot<FullScreenContentCallback>()
            every { ad.fullScreenContentCallback = capture(callbacks) } just Runs
            every { ad.show(activity) } just Runs
            AppOpenAdManager::class.java.getDeclaredField("appOpenAd").apply {
                isAccessible = true
                set(manager, ad)
            }
            AppOpenAdManager::class.java.getDeclaredField("loadedConsentRevision").apply {
                isAccessible = true
                setLong(manager, 0L)
            }
            AppOpenAdManager::class.java.getDeclaredField("loadElapsedRealtimeMs").apply {
                isAccessible = true
                setLong(manager, 10_000L)
            }

            assertThat(manager.showIfAvailable(activity)).isTrue()
            premium = becomesPremium
            callbacks.captured.onAdDismissedFullScreenContent()
            io.mockk.coVerify(atLeast = 1, timeout = 3000) { preferences.current() }
            if (becomesPremium) {
                verify(exactly = 0) {
                    AppOpenAd.load(any<Context>(), any<String>(), any<AdRequest>(), any())
                }
            } else {
                verify(exactly = 1, timeout = 3000) {
                    AppOpenAd.load(any<Context>(), any<String>(), any<AdRequest>(), any())
                }
            }
        } finally {
            unmockkStatic(SystemClock::class)
            unmockkStatic(AppOpenAd::class)
        }
    }

    @Test
    fun interstitialDismissalDoesNotReloadAfterPremiumActivation() {
        premiumAfterShow()
        mockkStatic(InterstitialAd::class)
        try {
            every { InterstitialAd.load(any<Context>(), any<String>(), any<AdRequest>(), any()) } just Runs
            val manager = InterstitialAdManager(context, consent, analytics, mockk(relaxed = true), eligibility)
            val ad = mockk<InterstitialAd>()
            val callbacks = slot<FullScreenContentCallback>()
            every { ad.fullScreenContentCallback = capture(callbacks) } just Runs
            every { ad.show(activity) } just Runs
            InterstitialAdManager::class.java.getDeclaredField("interstitialAd").apply {
                isAccessible = true
                set(manager, ad)
            }
            InterstitialAdManager::class.java.getDeclaredField("loadedConsentRevision").apply {
                isAccessible = true
                setLong(manager, 0L)
            }
            assertThat(manager.showIfAvailable(activity, "weekly_back")).isTrue()
            premium = true
            assertThat(runBlocking { eligibility.canShowInterstitial() }).isFalse()
            callbacks.captured.onAdDismissedFullScreenContent()
            io.mockk.coVerify(atLeast = 2, timeout = 3000) { preferences.current() }
            verify(exactly = 0) {
                InterstitialAd.load(any<Context>(), any<String>(), any<AdRequest>(), any())
            }
        } finally {
            unmockkStatic(InterstitialAd::class)
        }
    }

    @Test
    fun rewardedDismissalDoesNotReloadAfterPremiumActivation() {
        premiumAfterShow()
        mockkStatic(RewardedAd::class)
        try {
            every { RewardedAd.load(any<Context>(), any<String>(), any<AdRequest>(), any()) } just Runs
            val manager = RewardedAdManager(context, consent, analytics, eligibility)
            val ad = mockk<RewardedAd>(relaxed = true)
            val callbacks = slot<FullScreenContentCallback>()
            every { ad.fullScreenContentCallback = capture(callbacks) } just Runs
            RewardedAdManager::class.java.getDeclaredField("rewardedAd").apply {
                isAccessible = true
                set(manager, ad)
            }
            RewardedAdManager::class.java.getDeclaredField("loadedConsentRevision").apply {
                isAccessible = true
                setLong(manager, 0L)
            }
            assertThat(
                manager.showIfAvailable(
                    activity,
                    RewardedAdRequest("unlock_weekly_full", "synthetic-user", "synthetic-challenge", Long.MAX_VALUE),
                    onRewardEarned = {},
                ),
            ).isTrue()
            premium = true
            assertThat(runBlocking { eligibility.canShowRewarded() }).isFalse()
            callbacks.captured.onAdDismissedFullScreenContent()
            io.mockk.coVerify(atLeast = 2, timeout = 3000) { preferences.current() }
            verify(exactly = 0) {
                RewardedAd.load(any<Context>(), any<String>(), any<AdRequest>(), any())
            }
        } finally {
            unmockkStatic(RewardedAd::class)
        }
    }
}
