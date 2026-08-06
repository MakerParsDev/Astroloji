package com.parsfilo.astrology.feature.premium

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.repository.PremiumPlanUi
import org.junit.Test

class PremiumOfferPresentationTest {
    @Test
    fun `placeholder or missing plans cannot start a purchase`() {
        assertThat(isPremiumOfferReady(null)).isFalse()
        assertThat(
            isPremiumOfferReady(
                plan(
                    productId = "premium_monthly",
                    price = "...",
                ),
            ),
        ).isFalse()
        assertThat(
            isPremiumOfferReady(
                plan(
                    productId = "premium_monthly",
                    price = "",
                ),
            ),
        ).isFalse()
    }

    @Test
    fun `real Play price enables the selected offer`() {
        assertThat(
            isPremiumOfferReady(
                plan(
                    productId = "premium_monthly",
                    price = "₺89,99",
                ),
            ),
        ).isTrue()
    }

    @Test
    fun `billing cadence follows the product identity`() {
        assertThat(premiumBillingCadence(plan("premium_monthly", "₺89,99")))
            .isEqualTo(PremiumBillingCadence.MONTHLY)
        assertThat(premiumBillingCadence(plan("premium_yearly", "₺499,99")))
            .isEqualTo(PremiumBillingCadence.YEARLY)
    }

    private fun plan(
        productId: String,
        price: String,
    ): PremiumPlanUi =
        PremiumPlanUi(
            planId = "$productId:base:default",
            productId = productId,
            title = productId,
            price = price,
        )
}
