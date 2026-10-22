package com.parsfilo.astrology.core.util

import java.time.LocalDate
import java.time.Month
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.time.temporal.IsoFields
import java.util.Locale

private const val MAX_CALENDAR_SPAN_DAYS = 31
private const val LAST_ISO_WEEK_DECEMBER_DAY = 28
private const val ISO_WEEK_YEAR_DIGITS = 4
private val weekIdentifier = Regex("""^\d{4}-W(\d{2})$""")

private fun readingLocale(language: String): Locale = Locale.forLanguageTag(language)

/** Render valid backend month identifiers in the user's chosen language. */
internal fun localizedReadingMonth(
    identifier: String,
    language: String,
): String =
    runCatching {
        YearMonth.parse(identifier).atDay(1).format(DateTimeFormatter.ofPattern("LLLL yyyy", readingLocale(language)))
    }.getOrDefault(identifier)

internal fun localizedReadingWeek(identifier: String): String {
    val match = weekIdentifier.matchEntire(identifier)
    val weekNumber = match?.groupValues?.get(1)?.toIntOrNull()
    val weekYear = match?.value?.take(ISO_WEEK_YEAR_DIGITS)?.toIntOrNull()
    val maxWeek =
        weekYear?.let { year ->
            runCatching {
                LocalDate
                    .of(year, Month.DECEMBER, LAST_ISO_WEEK_DECEMBER_DAY)
                    .get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)
            }.getOrNull()
        }
    return if (weekNumber != null && maxWeek != null && weekNumber in 1..maxWeek) {
        weekNumber.toString()
    } else {
        identifier
    }
}

/** Invalid, missing or inverted date ranges are omitted instead of crashing the screen. */
private fun parsedReadingDate(value: String?): LocalDate? =
    value?.let {
        runCatching { LocalDate.parse(it) }.getOrNull()
    }

/** Invalid, missing or inverted date ranges are omitted instead of crashing the screen. */
internal fun localizedReadingRange(
    startValue: String?,
    endValue: String?,
    language: String,
): String? {
    val start = parsedReadingDate(startValue)
    val end = parsedReadingDate(endValue)
    val locale = readingLocale(language)
    val monthYear = DateTimeFormatter.ofPattern("LLLL yyyy", locale)
    val dayMonth = DateTimeFormatter.ofPattern("d MMMM", locale)
    val fullDate = DateTimeFormatter.ofPattern("d MMMM yyyy", locale)
    return if (start != null && end != null && !end.isBefore(start)) {
        when {
            start == end -> start.format(fullDate)
            start.year == end.year && start.month == end.month ->
                start.dayOfMonth.toString() + "–" + end.dayOfMonth + " " + end.format(monthYear)
            start.year == end.year -> start.format(dayMonth) + " – " + end.format(fullDate)
            else -> start.format(fullDate) + " – " + end.format(fullDate)
        }
    } else {
        null
    }
}

/** Only show bounded real API calendar dates, never parse unchecked data in Compose. */
internal fun readingCalendarDays(
    startValue: String?,
    endValue: String?,
): List<Int> {
    val start = parsedReadingDate(startValue)
    val end = parsedReadingDate(endValue)
    val days = if (start != null && end != null) ChronoUnit.DAYS.between(start, end) else -1L
    return if (start != null && days in 0..MAX_CALENDAR_SPAN_DAYS.toLong()) {
        (0..days.toInt()).map { start.plusDays(it.toLong()).dayOfMonth }
    } else {
        emptyList()
    }
}
