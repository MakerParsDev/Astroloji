package com.parsfilo.astrology.core.data.repository

import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.Purchase
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import org.junit.Test

class BillingManagerTest {
    private val monthlyPlan =
        PremiumPlanUi(
            planId = "premium_monthly:monthly:default",
            productId = "premium_monthly",
            basePlanId = "monthly",
            offerToken = "monthly-token",
            title = "Monthly",
            price = "₺394,99",
            priceAmountMicros = 394_990_000L,
            billingPeriod = "P1M",
            displayPriority = 1,
        )

    private val weeklyPlan =
        PremiumPlanUi(
            planId = "premium_weekly:weekly:default",
            productId = "premium_weekly",
            basePlanId = "weekly",
            offerToken = "weekly-token",
            title = "Weekly",
            price = "₺129,99",
            priceAmountMicros = 129_990_000L,
            billingPeriod = "P1W",
            displayPriority = 2,
        )

    private val yearlyPlan =
        PremiumPlanUi(
            planId = "premium_yearly:yearly:default",
            productId = "premium_yearly",
            basePlanId = "yearly",
            offerToken = "yearly-token",
            title = "Yearly",
            price = "₺3.499,99",
            priceAmountMicros = 3_499_990_000L,
            billingPeriod = "P1Y",
            displayPriority = 0,
        )

    private fun purchase(
        sku: String,
        state: Int,
    ): Purchase =
        mockk {
            every { purchaseState } returns state
            every { products } returns listOf(sku)
        }

    @Test
    fun `restore selects valid purchased subscription instead of first pending or unrelated item`() {
        val pending = purchase("premium_weekly", Purchase.PurchaseState.PENDING)
        val unknown = purchase("credits_small", Purchase.PurchaseState.PURCHASED)
        val owned = purchase("premium_monthly", Purchase.PurchaseState.PURCHASED)

        assertThat(selectPurchaseForVerification(listOf(pending, unknown, owned))).isSameInstanceAs(owned)
        assertThat(hasPendingPremiumPurchase(listOf(pending, unknown, owned))).isTrue()
    }

    @Test
    fun `restore does not accept only pending or unknown subscriptions`() {
        val pending = purchase("premium_weekly", Purchase.PurchaseState.PENDING)
        val unrelated = purchase("credits_small", Purchase.PurchaseState.PURCHASED)
        assertThat(selectPurchaseForVerification(listOf(pending, unrelated))).isNull()
        assertThat(hasPendingPremiumPurchase(listOf(pending, unrelated))).isTrue()
        assertThat(hasPendingPremiumPurchase(listOf(unrelated))).isFalse()
        assertThat(hasPendingPremiumPurchase(emptyList())).isFalse()
    }

    @Test
    fun `purchase callback recognizes pending premium and excludes pending credit pack`() {
        val pendingCredit = purchase("credits_large", Purchase.PurchaseState.PENDING)
        val pendingPremium = purchase("premium_yearly", Purchase.PurchaseState.PENDING)
        assertThat(hasPendingPremiumPurchase(listOf(pendingCredit))).isFalse()
        assertThat(hasPendingPremiumPurchase(listOf(pendingCredit, pendingPremium))).isTrue()
        assertThat(selectPurchaseForVerification(listOf(pendingCredit, pendingPremium))).isNull()
    }

    @Test
    fun `billing setup is ready only for ok response codes`() {
        assertThat(isSuccessfulBillingSetup(BillingClient.BillingResponseCode.OK)).isTrue()
        assertThat(isSuccessfulBillingSetup(BillingClient.BillingResponseCode.SERVICE_DISCONNECTED)).isFalse()
    }

    @Test
    fun `recognized purchase product resolution requires a single known premium sku`() {
        assertThat(resolveRecognizedProductId(listOf("premium_weekly"))).isEqualTo("premium_weekly")
        assertThat(resolveRecognizedProductId(listOf("premium_weekly", "premium_monthly"))).isNull()
        assertThat(resolveRecognizedProductId(listOf("premium_yearly"))).isEqualTo("premium_yearly")
        assertThat(resolveRecognizedProductId(listOf("unknown_sku"))).isNull()
    }

    @Test
    fun `recognized credit purchase resolution requires a single known credit sku`() {
        assertThat(resolveRecognizedCreditProductId(listOf("credits_medium"))).isEqualTo("credits_medium")
        assertThat(resolveRecognizedCreditProductId(listOf("credits_medium", "credits_small"))).isNull()
        assertThat(resolveRecognizedCreditProductId(listOf("premium_monthly"))).isNull()
        assertThat(resolveRecognizedCreditProductId(listOf("unknown_sku"))).isNull()
    }

    @Test
    fun `credit checkout callback never falls through into premium even when empty or malformed`() {
        val active = PendingBillingFlow.CREDITS
        assertThat(resolveSuccessfulPurchaseFlow(active, emptyList())).isEqualTo(active)
        assertThat(resolveSuccessfulPurchaseFlow(active, listOf(listOf("unknown_sku")))).isEqualTo(active)
        assertThat(resolveSuccessfulPurchaseFlow(active, listOf(listOf("premium_yearly")))).isEqualTo(active)
    }

    @Test
    fun `premium checkout callback never becomes credit purchase`() {
        val active = PendingBillingFlow.PREMIUM
        assertThat(resolveSuccessfulPurchaseFlow(active, emptyList())).isEqualTo(active)
        assertThat(resolveSuccessfulPurchaseFlow(active, listOf(listOf("credits_small")))).isEqualTo(active)
    }

    @Test
    fun `unsolicited recognized purchase is routed only when product family is unambiguous`() {
        val inactive = PendingBillingFlow.NONE
        assertThat(resolveSuccessfulPurchaseFlow(inactive, listOf(listOf("credits_small"))))
            .isEqualTo(PendingBillingFlow.CREDITS)
        assertThat(resolveSuccessfulPurchaseFlow(inactive, listOf(listOf("premium_monthly"))))
            .isEqualTo(PendingBillingFlow.PREMIUM)
        assertThat(resolveSuccessfulPurchaseFlow(inactive, emptyList())).isEqualTo(PendingBillingFlow.NONE)
        assertThat(resolveSuccessfulPurchaseFlow(inactive, listOf(listOf("unknown_sku"))))
            .isEqualTo(PendingBillingFlow.NONE)
        assertThat(resolveSuccessfulPurchaseFlow(inactive, listOf(listOf("credits_large"), listOf("premium_yearly"))))
            .isEqualTo(PendingBillingFlow.NONE)
        assertThat(resolveSuccessfulPurchaseFlow(inactive, listOf(listOf("credits_small", "premium_monthly"))))
            .isEqualTo(PendingBillingFlow.NONE)
    }

    @Test
    fun `plan ids are stable across base plan and offer variants`() {
        assertThat(buildPlanId("premium_weekly", "weekly", "trial"))
            .isEqualTo("premium_weekly:weekly:trial")
        assertThat(buildPlanId("premium_monthly", null, null))
            .isEqualTo("premium_monthly:base:default")
    }

    @Test
    fun `preferred offer index prioritizes free trial offers`() {
        assertThat(selectPreferredOfferIndex(listOf(false, true, false))).isEqualTo(1)
        assertThat(selectPreferredOfferIndex(listOf(false, false))).isEqualTo(0)
        assertThat(selectPreferredOfferIndex(emptyList())).isEqualTo(-1)
    }

    @Test
    fun `display price skips free trial phase and uses the first paid phase`() {
        val result =
            resolveDisplayPricing(
                listOf(
                    PricingPhaseSummary(priceAmountMicros = 0L, formattedPrice = "Free", billingPeriod = "P7D"),
                    PricingPhaseSummary(priceAmountMicros = 89_000_000L, formattedPrice = "TRY 89.00", billingPeriod = "P1M"),
                ),
            )

        assertThat(result?.priceAmountMicros).isEqualTo(89_000_000L)
        assertThat(result?.formattedPrice).isEqualTo("TRY 89.00")
        assertThat(result?.billingPeriod).isEqualTo("P1M")
    }

    @Test
    fun `trial metadata is derived only from zero-priced phases`() {
        assertThat(
            extractTrialDays(
                listOf(
                    PricingPhaseSummary(priceAmountMicros = 0L, formattedPrice = "Free", billingPeriod = "P3D"),
                    PricingPhaseSummary(priceAmountMicros = 89_000_000L, formattedPrice = "TRY 89.00", billingPeriod = "P1M"),
                ),
            ),
        ).isEqualTo(3)
        assertThat(
            extractTrialDays(
                listOf(
                    PricingPhaseSummary(priceAmountMicros = 89_000_000L, formattedPrice = "TRY 89.00", billingPeriod = "P1M"),
                ),
            ),
        ).isNull()
    }

    @Test
    fun `yearly plan is ordered first and selected by default`() {
        assertThat(defaultDisplayPriority("premium_yearly")).isEqualTo(0)
        assertThat(defaultDisplayPriority("premium_monthly")).isEqualTo(1)
        assertThat(defaultDisplayPriority("premium_weekly")).isEqualTo(2)
        assertThat(defaultDisplayPriority("unknown")).isEqualTo(Int.MAX_VALUE)
        assertThat(defaultPremiumPlan(listOf(weeklyPlan, monthlyPlan, yearlyPlan))).isEqualTo(yearlyPlan)
        assertThat(defaultPremiumPlan(listOf(weeklyPlan, monthlyPlan))).isEqualTo(monthlyPlan)
        assertThat(defaultPremiumPlan(listOf(weeklyPlan))).isEqualTo(weeklyPlan)
        assertThat(defaultPremiumPlan(emptyList())).isNull()
    }

    @Test
    fun `monthly_first paywall variant recommends monthly over yearly`() {
        assertThat(
            defaultPremiumPlan(listOf(weeklyPlan, monthlyPlan, yearlyPlan), PaywallVariant.MONTHLY_FIRST),
        ).isEqualTo(monthlyPlan)
        assertThat(
            defaultPremiumPlan(listOf(weeklyPlan, yearlyPlan), PaywallVariant.MONTHLY_FIRST),
        ).isEqualTo(yearlyPlan)
    }

    @Test
    fun `credit pack display priority orders small, medium, then large`() {
        assertThat(defaultCreditDisplayPriority("credits_small")).isEqualTo(0)
        assertThat(defaultCreditDisplayPriority("credits_medium")).isEqualTo(1)
        assertThat(defaultCreditDisplayPriority("credits_large")).isEqualTo(2)
        assertThat(defaultCreditDisplayPriority("unknown")).isEqualTo(Int.MAX_VALUE)
    }

    @Test
    fun `partial catalogue success keeps valid plans and diagnostics`() {
        val diagnostics = listOf(BillingCatalogueDiagnostic("premium_weekly", 3))

        val result =
            resolveCatalogueLoadResult(
                plans = listOf(monthlyPlan),
                diagnostics = diagnostics,
                queryMessage = null,
                catalogueUnavailableMessage = "Plans unavailable",
            )

        assertThat(result)
            .isEqualTo(BillingCatalogueLoadResult.Success(listOf(monthlyPlan), diagnostics))
    }

    @Test
    fun `empty unfetched catalogue returns localized retryable failure`() {
        val diagnostics =
            listOf(
                BillingCatalogueDiagnostic("premium_monthly", 3),
                BillingCatalogueDiagnostic("premium_weekly", 3),
            )

        val result =
            resolveCatalogueLoadResult(
                plans = emptyList(),
                diagnostics = diagnostics,
                queryMessage = null,
                catalogueUnavailableMessage = "Plans unavailable",
            )

        assertThat(result)
            .isEqualTo(BillingCatalogueLoadResult.Failure("Plans unavailable", diagnostics))
    }

    @Test
    fun `billing query failure keeps safe query message`() {
        val result =
            resolveCatalogueLoadResult(
                plans = emptyList(),
                diagnostics = emptyList(),
                queryMessage = "Billing service disconnected",
                catalogueUnavailableMessage = "Plans unavailable",
            )

        assertThat(result)
            .isEqualTo(
                BillingCatalogueLoadResult.Failure(
                    message = "Billing service disconnected",
                    diagnostics = emptyList(),
                ),
            )
    }
}
