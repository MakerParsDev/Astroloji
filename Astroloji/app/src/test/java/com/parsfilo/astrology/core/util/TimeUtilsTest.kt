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
}
