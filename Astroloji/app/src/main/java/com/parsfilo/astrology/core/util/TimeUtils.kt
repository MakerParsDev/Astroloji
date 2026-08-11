package com.parsfilo.astrology.core.util

import java.time.Clock
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.WeekFields
import java.util.Locale

object TimeUtils {
    private val dateFormatter = DateTimeFormatter.ISO_LOCAL_DATE
    private val yearMonthFormatter = DateTimeFormatter.ofPattern("yyyy-MM")

    fun normalizeLanguageTag(language: String?): String {
        val value = language?.lowercase(Locale.ROOT).orEmpty()
        return when {
            value.startsWith("tr") -> "tr"
            value.startsWith("es") -> "es"
            else -> "en"
        }
    }

    fun defaultLanguageTag(locale: Locale = Locale.getDefault()): String = normalizeLanguageTag(locale.language)

    fun currentLocalDate(clock: Clock = Clock.systemDefaultZone()): LocalDate = LocalDate.now(clock)

    fun greetingKey(hourOfDay: Int = LocalDateTime.now().hour): String =
        when (hourOfDay) {
            in 5..11 -> "greeting_morning"
            in 12..17 -> "greeting_afternoon"
            else -> "greeting_evening"
        }

    fun dateIdentifier(date: LocalDate = currentLocalDate()): String = date.format(dateFormatter)

    fun displayDate(
        language: String,
        date: LocalDate = currentLocalDate(),
    ): String {
        val normalizedLanguage = normalizeLanguageTag(language)
        val locale =
            when (normalizedLanguage) {
                "tr" -> Locale.forLanguageTag("tr-TR")
                "es" -> Locale.forLanguageTag("es-ES")
                else -> Locale.ENGLISH
            }
        val pattern = if (normalizedLanguage == "tr") "d MMMM EEE" else "d MMM EEE"
        return date.format(DateTimeFormatter.ofPattern(pattern, locale))
    }

    fun formatPercentage(
        value: Int,
        language: String,
    ): String =
        if (normalizeLanguageTag(language) == "tr") {
            "%$value"
        } else {
            "$value%"
        }

    fun weekIdentifier(date: LocalDate = currentLocalDate()): String {
        val weekFields = WeekFields.of(Locale.getDefault())
        return "%d-W%02d".format(date.year, date.get(weekFields.weekOfWeekBasedYear()))
    }

    fun monthIdentifier(date: LocalDate = currentLocalDate()): String = date.format(yearMonthFormatter)

    fun isExpired(
        cachedAtMillis: Long,
        ttl: Duration,
        nowMillis: Long = System.currentTimeMillis(),
    ): Boolean = nowMillis - cachedAtMillis > ttl.toMillis()

    fun parseIsoMillis(value: String?): Long? =
        value?.let {
            runCatching { OffsetDateTime.parse(it).toInstant().toEpochMilli() }.getOrNull()
        }

    fun utcOffsetHours(zoneId: ZoneId = ZoneId.systemDefault()): Int {
        val now = LocalDateTime.now(zoneId)
        return zoneId.rules.getOffset(now).totalSeconds / 3600
    }
}
