package com.parsfilo.astrology.core.ads

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AppOpenAdFreshnessTest {
    @Test
    fun cachedAdExpiresAtFourHourBoundary() {
        val loadedAt = 1_000L
        assertThat(isFreshAppOpenAd(loadedAt, loadedAt + APP_OPEN_AD_TTL_MS - 1L)).isTrue()
        assertThat(isFreshAppOpenAd(loadedAt, loadedAt + APP_OPEN_AD_TTL_MS)).isFalse()
        assertThat(isFreshAppOpenAd(loadedAt, loadedAt + APP_OPEN_AD_TTL_MS + 1L)).isFalse()
    }

    @Test
    fun warmBackgroundResumeCannotMeetBothFourHourGatesWithPreloadedAd() {
        val loadedAt = 1_000L
        val stoppedAt = 2_000L
        for (backgroundMs in listOf(APP_OPEN_AD_TTL_MS - 1L, APP_OPEN_AD_TTL_MS, APP_OPEN_AD_TTL_MS + 1L)) {
            val resumedAt = stoppedAt + backgroundMs
            val backgroundEligible = backgroundMs >= APP_OPEN_AD_TTL_MS
            val cachedAdValid = isFreshAppOpenAd(loadedAt, resumedAt)
            assertThat(backgroundEligible && cachedAdValid).isFalse()
        }
    }

    @Test
    fun coldStartAndClockOrderCannotUseAnOldAd() {
        assertThat(isFreshAppOpenAd(0L, APP_OPEN_AD_TTL_MS)).isFalse()
        assertThat(isFreshAppOpenAd(10_000L, 9_000L)).isFalse()
    }
}
