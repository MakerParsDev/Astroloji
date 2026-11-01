package com.parsfilo.astrology.core.data.preferences

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CachedPremiumExpiryTest {
    @Test
    fun `cached subscription is active until but not at its expiry`() {
        assertThat(isCachedPremiumUnexpired(true, 500L, 499L)).isTrue()
        assertThat(isCachedPremiumUnexpired(true, 500L, 500L)).isFalse()
        assertThat(isCachedPremiumUnexpired(true, 500L, 501L)).isFalse()
    }

    @Test
    fun `expired premium stays disabled after a fresh preferences read`() {
        val expiry = 1_783_020_000_000L
        assertThat(isCachedPremiumUnexpired(true, expiry, expiry + 60_000L)).isFalse()
    }

    @Test
    fun `non-premium stays disabled and missing historic expiry is unchanged`() {
        assertThat(isCachedPremiumUnexpired(false, null, 500L)).isFalse()
        assertThat(isCachedPremiumUnexpired(false, 1_000L, 500L)).isFalse()
        assertThat(isCachedPremiumUnexpired(true, null, 500L)).isTrue()
    }
}
