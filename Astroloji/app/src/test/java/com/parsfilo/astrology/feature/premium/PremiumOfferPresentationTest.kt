package com.parsfilo.astrology.feature.premium

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.repository.PremiumPlanUi
import org.junit.Test

class PremiumOfferPresentationTest {
    private val monthlyPlan =
        plan(
            productId = "premium_monthly",
            basePlanId = "monthly",
            price = "TRY 394.99",
            billingPeriod = "P1M",
            offerToken = "monthly-token",
            priceAmountMicros = 394_990_000L,
        )
    private val weeklyPlan =
        plan(
            productId = "premium_weekly",
            basePlanId = "weekly",
            price = "TRY 129.99",
            billingPeriod = "P1W",
            offerToken = "weekly-token",
        )
    private val yearlyPlan =
        plan(
            productId = "premium_yearly",
            basePlanId = "yearly",
            price = "TRY 2399.88",
            billingPeriod = "P1Y",
            offerToken = "yearly-token",
            priceAmountMicros = 2_399_880_000L,
        )

    @Test
    fun `missing price or offer token cannot start a purchase`() {
        assertThat(isPremiumOfferReady(null)).isFalse()
        assertThat(monthlyPlan.copy(price = "").let(::isPremiumOfferReady)).isFalse()
        assertThat(monthlyPlan.copy(price = "...").let(::isPremiumOfferReady)).isFalse()
        assertThat(monthlyPlan.copy(offerToken = null).let(::isPremiumOfferReady)).isFalse()
        assertThat(monthlyPlan.copy(offerToken = "").let(::isPremiumOfferReady)).isFalse()
    }

    @Test
    fun `real Play price and offer token enable the selected offer`() {
        assertThat(isPremiumOfferReady(monthlyPlan)).isTrue()
        assertThat(isPremiumOfferReady(weeklyPlan)).isTrue()
    }

    @Test
    fun `billing cadence supports monthly weekly and yearly plans`() {
        assertThat(premiumBillingCadence(monthlyPlan)).isEqualTo(PremiumBillingCadence.MONTHLY)
        assertThat(premiumBillingCadence(weeklyPlan)).isEqualTo(PremiumBillingCadence.WEEKLY)
        assertThat(premiumBillingCadence(yearlyPlan)).isEqualTo(PremiumBillingCadence.YEARLY)
    }

    @Test
    fun `contradictory Play plan contract is unknown`() {
        val mismatches =
            listOf(
                monthlyPlan.copy(billingPeriod = "P1W"),
                monthlyPlan.copy(basePlanId = "weekly"),
                weeklyPlan.copy(billingPeriod = "P1M"),
                weeklyPlan.copy(basePlanId = "monthly"),
                monthlyPlan.copy(productId = "other_monthly"),
            )

        mismatches.forEach { plan ->
            assertThat(premiumBillingCadence(plan)).isEqualTo(PremiumBillingCadence.UNKNOWN)
        }
    }

    @Test
    fun `only catalogue errors expose retry action`() {
        assertThat(
            premiumErrorMode(
                uiState = PremiumUiState(error = "catalogue unavailable"),
                selected = null,
            ),
        ).isEqualTo(PremiumErrorMode.RETRY_CATALOGUE)
        assertThat(
            premiumErrorMode(
                uiState = PremiumUiState(error = "purchase failed"),
                selected = monthlyPlan,
            ),
        ).isEqualTo(PremiumErrorMode.MESSAGE)
        assertThat(
            premiumErrorMode(
                uiState = PremiumUiState(error = null),
                selected = monthlyPlan,
            ),
        ).isEqualTo(PremiumErrorMode.NONE)
    }

    @Test
    fun `only yearly plan is recommended`() {
        assertThat(isRecommendedPremiumPlan(yearlyPlan)).isTrue()
        assertThat(isRecommendedPremiumPlan(monthlyPlan)).isFalse()
        assertThat(isRecommendedPremiumPlan(weeklyPlan)).isFalse()
        assertThat(
            isRecommendedPremiumPlan(
                plan(
                    productId = "other_yearly",
                    basePlanId = "yearly",
                    price = "TRY 1.00",
                    billingPeriod = "P1Y",
                    offerToken = "other-token",
                ),
            ),
        ).isFalse()
    }

    @Test
    fun `yearly savings are computed from real prices, never fabricated`() {
        assertThat(premiumYearlySavingsPercent(listOf(monthlyPlan, yearlyPlan))).isEqualTo(50)
        assertThat(premiumYearlySavingsPercent(listOf(monthlyPlan))).isNull()
        assertThat(premiumYearlySavingsPercent(listOf(yearlyPlan))).isNull()
        assertThat(premiumYearlySavingsPercent(emptyList())).isNull()
        assertThat(
            premiumYearlySavingsPercent(
                listOf(monthlyPlan, yearlyPlan.copy(priceAmountMicros = null)),
            ),
        ).isNull()
        val moreExpensiveYearly = yearlyPlan.copy(priceAmountMicros = monthlyPlan.priceAmountMicros!! * 13)
        assertThat(premiumYearlySavingsPercent(listOf(monthlyPlan, moreExpensiveYearly))).isNull()
    }

    @Suppress("LongParameterList")
    private fun plan(
        productId: String,
        basePlanId: String,
        price: String,
        billingPeriod: String,
        offerToken: String?,
        priceAmountMicros: Long? = null,
    ): PremiumPlanUi =
        PremiumPlanUi(
            planId = "$productId:$basePlanId:default",
            productId = productId,
            basePlanId = basePlanId,
            offerToken = offerToken,
            title = productId,
            price = price,
            billingPeriod = billingPeriod,
            priceAmountMicros = priceAmountMicros,
        )
}
