package com.parsfilo.astrology.feature.chart

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatterBuilder
import java.time.temporal.ChronoUnit

private const val UTC_FRACTION_DIGITS = 3
private const val UNKNOWN_BIRTH_HOUR_UTC = 12

private val utcMillisFormatter =
    DateTimeFormatterBuilder()
        .appendInstant(UTC_FRACTION_DIGITS)
        .toFormatter()

internal fun datePickerMillisToLocalDate(
    millis: Long,
): LocalDate =
    Instant
        .ofEpochMilli(millis)
        .atZone(ZoneOffset.UTC)
        .toLocalDate()

internal fun unknownBirthTimestamp(
    date: LocalDate,
): String = utcMillisFormatter.format(date.atTime(UNKNOWN_BIRTH_HOUR_UTC, 0).toInstant(ZoneOffset.UTC))

internal fun targetTimestamp(
    instant: Instant,
): String = utcMillisFormatter.format(instant.truncatedTo(ChronoUnit.MILLIS))
