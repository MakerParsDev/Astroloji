package com.parsfilo.astrology.core.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ZodiacSignTest {
    @Test
    fun `localizedDateRange returns Turkish month abbreviations for Turkish locale`() {
        assertThat(ZodiacSign.ARIES.localizedDateRange("tr")).isEqualTo("21 Mar - 19 Nis")
        assertThat(ZodiacSign.CAPRICORN.localizedDateRange("tr")).isEqualTo("22 Ara - 19 Oca")
    }

    @Test
    fun `localizedDateRange returns English month abbreviations for English locale`() {
        assertThat(ZodiacSign.ARIES.localizedDateRange("en")).isEqualTo("21 Mar - 19 Apr")
        assertThat(ZodiacSign.CAPRICORN.localizedDateRange("en")).isEqualTo("22 Dec - 19 Jan")
    }
}
