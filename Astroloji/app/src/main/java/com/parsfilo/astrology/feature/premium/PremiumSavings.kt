package com.parsfilo.astrology.feature.premium

import com.parsfilo.astrology.core.data.repository.PremiumPlanUi

private const val MONTHS_PER_YEAR = 12
private const val PERCENT_SCALE = 100

/**
 * Percentage saved by the yearly plan versus twelve months of the monthly plan, computed
 * only from real Play Billing prices (never a hardcoded or guessed discount). Returns null
 * when either price is unavailable so the UI never displays a fabricated number.
 */
internal fun premiumYearlySavingsPercent(plans: List<PremiumPlanUi>): Int? {
    val yearlyMicros =
        plans.firstOrNull { premiumBillingCadence(it) == PremiumBillingCadence.YEARLY }?.priceAmountMicros
    val monthlyMicros =
        plans.firstOrNull { premiumBillingCadence(it) == PremiumBillingCadence.MONTHLY }?.priceAmountMicros
    if (yearlyMicros == null || monthlyMicros == null) {
        return null
    }

    val yearlyEquivalentMonthlyMicros = yearlyMicros / MONTHS_PER_YEAR
    val isValidComparison = monthlyMicros > 0L && yearlyEquivalentMonthlyMicros < monthlyMicros
    return if (isValidComparison) {
        val savings = PERCENT_SCALE - (yearlyEquivalentMonthlyMicros * PERCENT_SCALE) / monthlyMicros
        savings.toInt().coerceIn(0, PERCENT_SCALE)
    } else {
        null
    }
}
