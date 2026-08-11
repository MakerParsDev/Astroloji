package com.parsfilo.astrology.core.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TimeUtilsTest {
    @Test
    fun `formatPercentage uses turkish style for turkish locale`() {
        assertThat(TimeUtils.formatPercentage(73, "tr")).isEqualTo("%73")
    }

    @Test
    fun `formatPercentage uses english style for english locale`() {
        assertThat(TimeUtils.formatPercentage(73, "en")).isEqualTo("73%")
    }

    @Test
    fun `formatPercentage uses english style for spanish locale`() {
        assertThat(TimeUtils.formatPercentage(73, "es")).isEqualTo("73%")
    }

    @Test
    fun `normalizeLanguageTag recognizes spanish`() {
        assertThat(TimeUtils.normalizeLanguageTag("es")).isEqualTo("es")
        assertThat(TimeUtils.normalizeLanguageTag("es-ES")).isEqualTo("es")
    }

    @Test
    fun `normalizeLanguageTag falls back to english for unknown languages`() {
        assertThat(TimeUtils.normalizeLanguageTag("de")).isEqualTo("en")
    }
}
