package com.parsfilo.astrology.core.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.time.LocalDate

class MoonPhaseCalculatorTest {
    @Test
    fun `identifies a new moon date`() {
        val result = MoonPhaseCalculator.calculate(LocalDate.parse("2024-04-08"))

        assertThat(result.phase).isEqualTo(MoonPhase.NEW)
        assertThat(result.illuminationPercent).isAtMost(5)
    }

    @Test
    fun `identifies a full moon date`() {
        val result = MoonPhaseCalculator.calculate(LocalDate.parse("2024-04-23"))

        assertThat(result.phase).isEqualTo(MoonPhase.FULL)
        assertThat(result.illuminationPercent).isAtLeast(95)
    }
}
