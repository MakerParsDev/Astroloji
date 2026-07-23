package com.parsfilo.astrology.core.util

import java.time.LocalDate
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit

data class StreakInfo(
    val lastDate: String,
    val count: Int,
    val achievedMilestone: Int? = null,
)

object StreakTracker {
    fun update(
        previousDate: String?,
        previousCount: Int,
        utcOffset: Int,
        today: LocalDate = LocalDate.now(ZoneOffset.ofHours(utcOffset)),
    ): StreakInfo {
        val parsed = previousDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        val count =
            when {
                parsed == null -> 1
                parsed == today -> previousCount
                ChronoUnit.DAYS.between(parsed, today) == 1L -> previousCount + 1
                else -> 1
            }
        val milestone =
            when {
                count >= 100 -> 100
                count >= 60 -> 60
                count >= 30 -> 30
                count >= 14 -> 14
                count >= 7 -> 7
                count >= 3 -> 3
                else -> null
            }
        return StreakInfo(lastDate = today.toString(), count = count, achievedMilestone = milestone)
    }
}
