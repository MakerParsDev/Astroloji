package com.parsfilo.astrology.feature.premium

import com.parsfilo.astrology.core.data.repository.PremiumPlanUi

internal enum class PremiumBillingCadence {
    MONTHLY,
    WEEKLY,
    YEARLY,
    UNKNOWN,
}

internal fun premiumBillingCadence(plan: PremiumPlanUi): PremiumBillingCadence =
    when {
        plan.productId == "premium_monthly" &&
            plan.basePlanId == "monthly" &&
            plan.billingPeriod == "P1M" -> PremiumBillingCadence.MONTHLY
        plan.productId == "premium_weekly" &&
            plan.basePlanId == "weekly" &&
            plan.billingPeriod == "P1W" -> PremiumBillingCadence.WEEKLY
        plan.productId == "premium_yearly" &&
            plan.basePlanId == "yearly" &&
            plan.billingPeriod == "P1Y" -> PremiumBillingCadence.YEARLY
        else -> PremiumBillingCadence.UNKNOWN
    }

internal fun isRecommendedPremiumPlan(plan: PremiumPlanUi): Boolean = plan.productId == "premium_yearly"

internal fun isPremiumOfferReady(
    plan: PremiumPlanUi?,
): Boolean =
    plan != null &&
        plan.price.isNotBlank() &&
        plan.price != "..." &&
        !plan.offerToken.isNullOrBlank()
