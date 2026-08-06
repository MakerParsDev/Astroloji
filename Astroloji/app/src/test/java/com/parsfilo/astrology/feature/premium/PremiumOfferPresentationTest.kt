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
        )
    private val weeklyPlan =
        plan(
            productId = "premium_weekly",
            basePlanId = "weekly",
            price = "TRY 129.99",
            billingPeriod = "P1W",
            offerToken = "weekly-token",
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
    fun `billing cadence supports monthly weekly and unknown plans`() {
        assertThat(premiumBillingCadence(monthlyPlan)).isEqualTo(PremiumBillingCadence.MONTHLY)
        assertThat(premiumBillingCadence(weeklyPlan)).isEqualTo(PremiumBillingCadence.WEEKLY)
        assertThat(
            premiumBillingCadence(
                plan(
                    productId = "premium_yearly",
                    basePlanId = "yearly",
                    price = "TRY 999.99",
                    billingPeriod = "P1Y",
                    offerToken = "yearly-token",
                ),
            ),
        ).isEqualTo(PremiumBillingCadence.UNKNOWN)
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
    fun `only monthly plan is recommended`() {
        assertThat(isRecommendedPremiumPlan(monthlyPlan)).isTrue()
        assertThat(isRecommendedPremiumPlan(weeklyPlan)).isFalse()
        assertThat(
            isRecommendedPremiumPlan(
                plan(
                    productId = "other_monthly",
                    basePlanId = "monthly",
                    price = "TRY 1.00",
                    billingPeriod = "P1M",
                    offerToken = "other-token",
                ),
            ),
        ).isFalse()
    }

    private fun plan(
        productId: String,
        basePlanId: String,
        price: String,
        billingPeriod: String,
        offerToken: String?,
    ): PremiumPlanUi =
        PremiumPlanUi(
            planId = "$productId:$basePlanId:default",
            productId = productId,
            basePlanId = basePlanId,
            offerToken = offerToken,
            title = productId,
            price = price,
            billingPeriod = billingPeriod,
        )
}
