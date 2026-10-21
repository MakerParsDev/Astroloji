package com.parsfilo.astrology.feature.onboarding

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.TimeZone

class OnboardingBirthDateLabelTest {
    @Test
    fun selectedDatesRemainCalendarDatesAcrossTimezonesAndDstBoundaries() {
        val original = TimeZone.getDefault()
        try {
            for (zone in listOf("UTC", "America/Los_Angeles", "Asia/Istanbul")) {
                TimeZone.setDefault(TimeZone.getTimeZone(zone))
                for (isoDay in listOf("2026-03-08", "2026-11-01", "1990-01-01")) {
                    val pickerMillis = Instant.parse(isoDay + "T00:00:00Z").toEpochMilli()
                    assertThat(formatSelectedBirthDate(pickerMillis, DateTimeFormatter.ISO_LOCAL_DATE))
                        .isEqualTo(isoDay)
                }
            }
        } finally {
            TimeZone.setDefault(original)
        }
    }

    @Test
    fun displayLanguageStillControlsMonthNamesWithoutChangingTheDate() {
        val millis = Instant.parse("2026-03-08T00:00:00Z").toEpochMilli()
        val tr = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.forLanguageTag("tr"))
        val en = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH)

        assertThat(formatSelectedBirthDate(millis, tr)).isEqualTo("8 Mart 2026")
        assertThat(formatSelectedBirthDate(millis, en)).isEqualTo("8 March 2026")
    }
}
