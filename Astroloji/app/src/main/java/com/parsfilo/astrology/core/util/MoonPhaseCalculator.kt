package com.parsfilo.astrology.core.util

import java.time.LocalDate
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt

enum class MoonPhase(
    val emoji: String,
) {
    NEW("🌑"),
    WAXING_CRESCENT("🌒"),
    FIRST_QUARTER("🌓"),
    WAXING_GIBBOUS("🌔"),
    FULL("🌕"),
    WANING_GIBBOUS("🌖"),
    LAST_QUARTER("🌗"),
    WANING_CRESCENT("🌘"),
}

data class MoonPhaseInfo(
    val phase: MoonPhase,
    val illuminationPercent: Int,
    val ageDays: Double,
)

object MoonPhaseCalculator {
    private const val SYNODIC_MONTH = 29.53058867
    private val referenceNewMoon = LocalDate.of(2000, 1, 6)

    fun calculate(date: LocalDate = LocalDate.now(ZoneOffset.UTC)): MoonPhaseInfo {
        val daysSinceReference = ChronoUnit.DAYS.between(referenceNewMoon, date).toDouble()
        val ageDays = ((daysSinceReference % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH
        val normalizedAge = ageDays / SYNODIC_MONTH
        val illuminationPercent =
            (((1 - cos(normalizedAge * 2 * PI)) / 2) * 100)
                .roundToInt()
                .coerceIn(0, 100)

        val phase =
            when {
                normalizedAge < 0.0625 || normalizedAge >= 0.9375 -> MoonPhase.NEW
                normalizedAge < 0.1875 -> MoonPhase.WAXING_CRESCENT
                normalizedAge < 0.3125 -> MoonPhase.FIRST_QUARTER
                normalizedAge < 0.4375 -> MoonPhase.WAXING_GIBBOUS
                normalizedAge < 0.5625 -> MoonPhase.FULL
                normalizedAge < 0.6875 -> MoonPhase.WANING_GIBBOUS
                normalizedAge < 0.8125 -> MoonPhase.LAST_QUARTER
                else -> MoonPhase.WANING_CRESCENT
            }

        return MoonPhaseInfo(
            phase = phase,
            illuminationPercent = illuminationPercent,
            ageDays = ageDays,
        )
    }
}
