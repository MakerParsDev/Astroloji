package com.parsfilo.astrology.feature.premium

import com.parsfilo.astrology.core.data.repository.PremiumPlanUi

internal enum class PremiumBillingCadence {
    MONTHLY,
    YEARLY,
}

internal fun premiumBillingCadence(plan: PremiumPlanUi): PremiumBillingCadence =
    if (plan.productId.contains("year", ignoreCase = true)) {
        PremiumBillingCadence.YEARLY
    } else {
        PremiumBillingCadence.MONTHLY
    }

internal fun isPremiumOfferReady(
    plan: PremiumPlanUi?,
): Boolean = plan != null && plan.price.isNotBlank() && plan.price != "..."
