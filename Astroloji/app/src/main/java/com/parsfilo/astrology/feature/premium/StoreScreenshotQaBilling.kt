package com.parsfilo.astrology.feature.premium

import com.parsfilo.astrology.core.data.repository.BillingCatalogueLoadResult
import com.parsfilo.astrology.core.data.repository.PremiumPlanUi

internal fun storeScreenshotQaPlans(language: String): List<PremiumPlanUi> {
    val isTurkish = language.lowercase().startsWith("tr")
    return listOf(
        PremiumPlanUi(
            planId = "premium_monthly:monthly:storeqa",
            productId = "premium_monthly",
            basePlanId = "monthly",
            offerId = "storeqa",
            offerToken = "storeqa-display-only",
            title = if (isTurkish) "Aylık Premium" else "Monthly Premium",
            price = if (isTurkish) "₺394,99" else "$6.99",
            billingPeriod = "P1M",
            displayPriority = 0,
        ),
        PremiumPlanUi(
            planId = "premium_weekly:weekly:storeqa",
            productId = "premium_weekly",
            basePlanId = "weekly",
            offerId = "storeqa",
            offerToken = "storeqa-display-only",
            title = if (isTurkish) "Haftalık Premium" else "Weekly Premium",
            price = if (isTurkish) "₺129,99" else "$2.29",
            billingPeriod = "P1W",
            displayPriority = 1,
        ),
    )
}

internal suspend fun resolvePremiumCatalogue(
    storeScreenshotQa: Boolean,
    language: String,
    live: suspend () -> BillingCatalogueLoadResult,
): BillingCatalogueLoadResult =
    if (storeScreenshotQa) {
        BillingCatalogueLoadResult.Success(
            plans = storeScreenshotQaPlans(language),
            diagnostics = emptyList(),
        )
    } else {
        live()
    }
