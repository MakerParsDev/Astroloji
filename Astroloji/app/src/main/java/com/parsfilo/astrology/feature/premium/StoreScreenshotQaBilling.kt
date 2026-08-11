package com.parsfilo.astrology.feature.premium

import com.parsfilo.astrology.core.data.repository.BillingCatalogueLoadResult
import com.parsfilo.astrology.core.data.repository.PremiumPlanUi

private data class StoreQaPlanCopy(
    val monthlyTitle: String,
    val monthlyPrice: String,
    val weeklyTitle: String,
    val weeklyPrice: String,
)

private val STORE_QA_PLAN_COPY =
    mapOf(
        "tr" to StoreQaPlanCopy("Aylık Premium", "₺394,99", "Haftalık Premium", "₺129,99"),
        "de" to StoreQaPlanCopy("Monatliches Premium", "6,99 €", "Wöchentliches Premium", "2,29 €"),
    )
private val STORE_QA_PLAN_COPY_DEFAULT = StoreQaPlanCopy("Monthly Premium", "$6.99", "Weekly Premium", "$2.29")

internal fun storeScreenshotQaPlans(language: String): List<PremiumPlanUi> {
    val copy = STORE_QA_PLAN_COPY[language.lowercase().substringBefore('-')] ?: STORE_QA_PLAN_COPY_DEFAULT
    return listOf(
        PremiumPlanUi(
            planId = "premium_monthly:monthly:storeqa",
            productId = "premium_monthly",
            basePlanId = "monthly",
            offerId = "storeqa",
            offerToken = "storeqa-display-only",
            title = copy.monthlyTitle,
            price = copy.monthlyPrice,
            billingPeriod = "P1M",
            displayPriority = 0,
        ),
        PremiumPlanUi(
            planId = "premium_weekly:weekly:storeqa",
            productId = "premium_weekly",
            basePlanId = "weekly",
            offerId = "storeqa",
            offerToken = "storeqa-display-only",
            title = copy.weeklyTitle,
            price = copy.weeklyPrice,
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
