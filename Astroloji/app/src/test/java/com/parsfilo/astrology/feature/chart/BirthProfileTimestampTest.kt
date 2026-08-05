package com.parsfilo.astrology.feature.chart

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.time.Instant
import java.time.LocalDate

class BirthProfileTimestampTest {
    @Test
    fun `unknown birth time uses noon UTC to avoid day boundary ambiguity`() {
        assertThat(unknownBirthTimestamp(LocalDate.of(1990, 1, 15)))
            .isEqualTo("1990-01-15T12:00:00.000Z")
    }

    @Test
    fun `date picker milliseconds are interpreted as a UTC calendar date`() {
        val pickerMillis = Instant.parse("1990-01-15T00:00:00.000Z").toEpochMilli()

        assertThat(datePickerMillisToLocalDate(pickerMillis))
            .isEqualTo(LocalDate.of(1990, 1, 15))
    }

    @Test
    fun `target timestamp is stable to whole milliseconds`() {
        assertThat(targetTimestamp(Instant.parse("2026-08-05T11:22:33.987654Z")))
            .isEqualTo("2026-08-05T11:22:33.987Z")
    }
}
