package com.parsfilo.astrology.core.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReadingDateLabelsTest {
    @Test
    fun validMonthAndWeekIdentifiersAreReadableInAllSupportedLanguages() {
        val months =
            mapOf(
                "tr" to "Ekim",
                "en" to "October",
                "de" to "Oktober",
                "fr" to "octobre",
                "es" to "octubre",
                "pt" to "outubro",
            )
        for ((language, monthName) in months) {
            val month = localizedReadingMonth("2026-10", language)
            assertThat(month).contains(monthName)
            assertThat(month).contains("2026")
            assertThat(localizedReadingRange("2026-10-01", "2026-10-31", language))
                .contains(monthName)
        }
        assertThat(localizedReadingWeek("2026-W43")).isEqualTo("43")
    }

    @Test
    fun turkishRangeMatchesNativeMonthDisplay() {
        assertThat(localizedReadingMonth("2026-10", "tr")).isEqualTo("Ekim 2026")
        assertThat(localizedReadingRange("2026-10-01", "2026-10-31", "tr"))
            .isEqualTo("1–31 Ekim 2026")
    }

    @Test
    fun monthAndYearBoundariesRemainUnambiguous() {
        assertThat(localizedReadingRange("2026-09-28", "2026-10-04", "tr"))
            .isEqualTo("28 Eylül – 4 Ekim 2026")
        assertThat(localizedReadingRange("2026-12-28", "2027-01-03", "en"))
            .isEqualTo("28 December 2026 – 3 January 2027")
        assertThat(readingCalendarDays("2026-09-29", "2026-10-03"))
            .containsExactly(29, 30, 1, 2, 3)
            .inOrder()
    }

    @Test
    fun malformedInvertedAndExcessiveApiRangesNeverCrashOrFabricateDates() {
        assertThat(localizedReadingRange(null, "2026-10-31", "tr")).isNull()
        assertThat(localizedReadingRange("bad", "2026-10-31", "tr")).isNull()
        assertThat(localizedReadingRange("2026-11-01", "2026-10-31", "tr")).isNull()
        assertThat(readingCalendarDays("bad", "2026-10-31")).isEmpty()
        assertThat(readingCalendarDays("2026-11-01", "2026-10-31")).isEmpty()
        assertThat(readingCalendarDays("2026-01-01", "2026-12-31")).isEmpty()
        assertThat(localizedReadingMonth("invalid", "tr")).isEqualTo("invalid")
        assertThat(localizedReadingWeek("invalid")).isEqualTo("invalid")
    }
}
