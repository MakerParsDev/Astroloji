package com.parsfilo.astrology.feature.onboarding

import com.parsfilo.astrology.feature.chart.datePickerMillisToLocalDate
import java.time.format.DateTimeFormatter

/** A DatePicker timestamp represents a calendar date at UTC midnight, never device local midnight. */
internal fun formatSelectedBirthDate(
    millis: Long,
    formatter: DateTimeFormatter,
): String = datePickerMillisToLocalDate(millis).format(formatter)
