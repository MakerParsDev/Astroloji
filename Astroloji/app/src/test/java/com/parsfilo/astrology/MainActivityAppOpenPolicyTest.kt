package com.parsfilo.astrology

import com.google.common.truth.Truth.assertThat
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
            appOpenCount = 4,
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
    fun `first three app opens never show app open ad`() {
        (1..3).forEach { openCount ->
            assertFalse(
                shouldShowAppOpenAd(
                    basePolicy.copy(
                        appOpenCount = openCount,
                        minBackgroundDurationMs = 10_000L,
                    ),
                ),
            )
        }
    }

    @Test
    fun `fourth app open can show app open ad after the safe background interval`() {
        assertTrue(
            shouldShowAppOpenAd(
                basePolicy.copy(
                    appOpenCount = 4,
                    minBackgroundDurationMs = 10_000L,
                ),
            ),
        )
    }

    @Test
    fun `default policy requires four hours in background`() {
        assertFalse(
            shouldShowAppOpenAd(
                basePolicy.copy(
                    lastStoppedAtMs = 1_000L,
                    nowMs = 1_000L + (4L * 60L * 60L * 1_000L) - 1L,
                ),
            ),
        )
        assertTrue(
            shouldShowAppOpenAd(
                basePolicy.copy(
                    lastStoppedAtMs = 1_000L,
                    nowMs = 1_000L + (4L * 60L * 60L * 1_000L),
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
    fun `premium users skip every ad preload`() {
        val plan =
            resolveAdPreloadPlan(
                AdPreloadPolicy(
                    isPremium = true,
                    canShowRewarded = true,
                ),
            )

        assertFalse(plan.preloadAppOpen)
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

    @Test
    fun `onboarding launches do not consume protected app opens`() {
        assertThat(resolveNextAppOpenCount(onboardingCompleted = false, persistedCount = 12))
            .isEqualTo(0)
        assertThat(resolveNextAppOpenCount(onboardingCompleted = true, persistedCount = 2))
            .isEqualTo(3)
    }
}
