package com.parsfilo.astrology.core.ads

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FullScreenAdFreshnessTest {
    @Test
    fun `fresh creative is rejected at exactly one hour`() {
        val loadedAt = 5_000_000_000L
        assertThat(isFreshFullScreenAd(loadedAt, loadedAt)).isTrue()
        assertThat(isFreshFullScreenAd(loadedAt, loadedAt + FULL_SCREEN_AD_TTL_NANOS - 1)).isTrue()
        assertThat(isFreshFullScreenAd(loadedAt, loadedAt + FULL_SCREEN_AD_TTL_NANOS)).isFalse()
        assertThat(isFreshFullScreenAd(loadedAt, loadedAt + FULL_SCREEN_AD_TTL_NANOS + 1)).isFalse()
    }

    @Test
    fun `unknown and reversed monotonic timestamps fail closed`() {
        assertThat(isFreshFullScreenAd(0L, 1234L)).isFalse()
        assertThat(isFreshFullScreenAd(1234L, 1233L)).isFalse()
    }

    @Test
    fun `nanosecond clock uses full hour not milliseconds`() {
        assertThat(FULL_SCREEN_AD_TTL_NANOS).isEqualTo(3_600_000_000_000L)
    }
}
