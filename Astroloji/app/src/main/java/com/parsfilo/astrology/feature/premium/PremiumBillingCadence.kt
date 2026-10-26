package com.parsfilo.astrology.feature.premium

import com.parsfilo.astrology.core.data.repository.PaywallVariant
import com.parsfilo.astrology.core.data.repository.PremiumPlanUi
import com.parsfilo.astrology.core.data.repository.recommendedPremiumProductId

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

internal fun isRecommendedPremiumPlan(
    plan: PremiumPlanUi,
    variant: PaywallVariant = PaywallVariant.YEARLY_FIRST,
): Boolean = plan.productId == recommendedPremiumProductId(variant)

internal fun isPremiumOfferReady(
    plan: PremiumPlanUi?,
): Boolean =
    plan != null &&
        plan.price.isNotBlank() &&
        plan.price != "..." &&
        !plan.offerToken.isNullOrBlank() &&
        // Never offer checkout when an actual Play trial cannot be described
        // truthfully (e.g. a month-long period we cannot express in days).
        (!plan.hasFreeTrial || (plan.trialDays != null && plan.trialDays > 0))
