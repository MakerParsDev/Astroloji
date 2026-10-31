package com.parsfilo.astrology.core.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.time.LocalDate
import java.util.Locale

class TimeUtilsTest {
    @Test
    fun `ISO week identifier uses week based year at January boundary`() {
        assertThat(TimeUtils.weekIdentifier(LocalDate.of(2021, 1, 1))).isEqualTo("2020-W53")
        assertThat(TimeUtils.weekIdentifier(LocalDate.of(2021, 1, 4))).isEqualTo("2021-W01")
        assertThat(TimeUtils.weekIdentifier(LocalDate.of(2027, 1, 1))).isEqualTo("2026-W53")
        assertThat(TimeUtils.weekIdentifier(LocalDate.of(2027, 1, 4))).isEqualTo("2027-W01")
    }

    @Test
    fun `weekly content and SSV period keys do not depend on the phone locale`() {
        val original = Locale.getDefault()
        try {
            val date = LocalDate.of(2021, 1, 3)
            Locale.setDefault(Locale.US)
            val englishIdentifier = TimeUtils.weekIdentifier(date)
            Locale.setDefault(Locale.forLanguageTag("tr-TR"))
            val turkishIdentifier = TimeUtils.weekIdentifier(date)

            assertThat(englishIdentifier).isEqualTo("2020-W53")
            assertThat(turkishIdentifier).isEqualTo(englishIdentifier)
        } finally {
            Locale.setDefault(original)
        }
    }

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
    fun `formatPercentage uses english style for portuguese locale`() {
        assertThat(TimeUtils.formatPercentage(73, "pt")).isEqualTo("73%")
    }

    @Test
    fun `formatPercentage uses english style for german locale`() {
        assertThat(TimeUtils.formatPercentage(73, "de")).isEqualTo("73%")
    }

    @Test
    fun `formatPercentage uses english style for french locale`() {
        assertThat(TimeUtils.formatPercentage(73, "fr")).isEqualTo("73%")
    }

    @Test
    fun `normalizeLanguageTag recognizes spanish`() {
        assertThat(TimeUtils.normalizeLanguageTag("es")).isEqualTo("es")
        assertThat(TimeUtils.normalizeLanguageTag("es-ES")).isEqualTo("es")
    }

    @Test
    fun `normalizeLanguageTag recognizes portuguese`() {
        assertThat(TimeUtils.normalizeLanguageTag("pt")).isEqualTo("pt")
        assertThat(TimeUtils.normalizeLanguageTag("pt-BR")).isEqualTo("pt")
    }

    @Test
    fun `normalizeLanguageTag recognizes german`() {
        assertThat(TimeUtils.normalizeLanguageTag("de")).isEqualTo("de")
        assertThat(TimeUtils.normalizeLanguageTag("de-DE")).isEqualTo("de")
    }

    @Test
    fun `normalizeLanguageTag recognizes french`() {
        assertThat(TimeUtils.normalizeLanguageTag("fr")).isEqualTo("fr")
        assertThat(TimeUtils.normalizeLanguageTag("fr-FR")).isEqualTo("fr")
    }

    @Test
    fun `normalizeLanguageTag falls back to english for unknown languages`() {
        assertThat(TimeUtils.normalizeLanguageTag("it")).isEqualTo("en")
    }
}
