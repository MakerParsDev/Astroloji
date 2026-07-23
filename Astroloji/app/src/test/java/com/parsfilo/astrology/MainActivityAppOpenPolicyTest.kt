package com.parsfilo.astrology

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MainActivityAppOpenPolicyTest {
    private val basePolicy =
        AppOpenAdPolicy(
            isDebug = false,
            onboardingCompleted = true,
            isPremium = false,
            canRequestAds = true,
            skipNextAppOpen = false,
            lastStoppedAtMs = 1_000L,
            nowMs = 20_000L,
        )

    @Test
    fun `skip flag blocks app open ad`() {
        assertFalse(
            shouldShowAppOpenAd(
                basePolicy.copy(
                    skipNextAppOpen = true,
                ),
            ),
        )
    }

    @Test
    fun `cold start without background timestamp does not show app open ad`() {
        assertFalse(
            shouldShowAppOpenAd(
                basePolicy.copy(
                    lastStoppedAtMs = 0L,
                ),
            ),
        )
    }

    @Test
    fun `recent lifecycle bounce does not show app open ad`() {
        assertFalse(
            shouldShowAppOpenAd(
                basePolicy.copy(
                    lastStoppedAtMs = 10_000L,
                    nowMs = 16_000L,
                    minBackgroundDurationMs = 10_000L,
                ),
            ),
        )
    }

    @Test
    fun `eligible return from background shows app open ad`() {
        assertTrue(
            shouldShowAppOpenAd(
                basePolicy.copy(
                    minBackgroundDurationMs = 10_000L,
                ),
            ),
        )
    }

    @Test
    fun `debug build never shows app open ad`() {
        assertFalse(
            shouldShowAppOpenAd(
                basePolicy.copy(
                    isDebug = true,
                ),
            ),
        )
    }

    @Test
    fun `premium users skip interstitial native and rewarded preloads`() {
        val plan =
            resolveAdPreloadPlan(
                AdPreloadPolicy(
                    isPremium = true,
                    canShowRewarded = false,
                ),
            )

        assertTrue(plan.preloadAppOpen)
        assertFalse(plan.preloadInterstitial)
        assertFalse(plan.preloadRewarded)
        assertFalse(plan.preloadRewardedInterstitial)
        assertFalse(plan.preloadNative)
    }

    @Test
    fun `free users preload first wave ad formats only`() {
        val plan =
            resolveAdPreloadPlan(
                AdPreloadPolicy(
                    isPremium = false,
                    canShowRewarded = true,
                ),
            )

        assertTrue(plan.preloadAppOpen)
        assertTrue(plan.preloadInterstitial)
        assertTrue(plan.preloadRewarded)
        assertFalse(plan.preloadRewardedInterstitial)
        assertTrue(plan.preloadNative)
    }
}
