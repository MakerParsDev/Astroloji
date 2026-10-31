package com.parsfilo.astrology.core.data.repository

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.Purchase
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.BillingFailureReason
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.unmockkStatic
import io.mockk.verify
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Test

class BillingManagerTest {
    @Test
    fun `credit checkout cannot start during a premium billing flow`() {
        val billingClient = mockk<BillingClient>(relaxed = true)
        val builder = mockk<BillingClient.Builder>(relaxed = true)
        every { builder.setListener(any()) } returns builder
        every { builder.enablePendingPurchases(any()) } returns builder
        every { builder.enableAutoServiceReconnection() } returns builder
        every { builder.build() } returns billingClient
        every { billingClient.isReady } returns false
        every { billingClient.startConnection(any()) } returns Unit
        mockkStatic(BillingClient::class)
        try {
            every { BillingClient.newBuilder(any()) } returns builder
            val manager =
                BillingManager(
                    context = mockk<Context>(),
                    sessionRepository = mockk(),
                    creditsRepository = mockk(),
                    stringsProvider = mockk(relaxed = true),
                )
            try {
                val activity = mockk<Activity>()
                manager.launchPurchase(activity, "premium_weekly")
                manager.launchCreditPurchase(activity, "credits_small")

                // Even before the asynchronous Google Play connection resolves,
                // the shared billing manager must refuse the competing checkout.
                assertThat(manager.creditPurchaseState.value).isInstanceOf(AppResult.Error::class.java)
            } finally {
                manager.close()
            }
        } finally {
            unmockkStatic(BillingClient::class)
        }
    }

    @Test
    fun `shared checkout gate rejects overlapping premium and credit requests in either order`() {
        val gate = BillingCheckoutGate()
        assertThat(gate.tryStart(PendingBillingFlow.PREMIUM)).isTrue()
        assertThat(gate.tryStart(PendingBillingFlow.CREDITS)).isFalse()
        assertThat(gate.tryStart(PendingBillingFlow.PREMIUM)).isFalse()
        gate.finish(PendingBillingFlow.CREDITS)
        assertThat(gate.currentFlow()).isEqualTo(PendingBillingFlow.PREMIUM)
        gate.finish(PendingBillingFlow.PREMIUM)
        assertThat(gate.tryStart(PendingBillingFlow.CREDITS)).isTrue()
        assertThat(gate.tryStart(PendingBillingFlow.PREMIUM)).isFalse()
        gate.finish(PendingBillingFlow.CREDITS)
        assertThat(gate.currentFlow()).isEqualTo(PendingBillingFlow.NONE)
    }

    @Test
    fun `restore must not overwrite an in-flight premium checkout`() {
        withPendingBillingClient { manager, billingClient ->
            manager.launchPurchase(mockk<Activity>(), "premium_weekly")

            val result =
                runBlocking {
                    withTimeout(1_000) { manager.restorePurchases() }
                }
            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            verify(exactly = 0) { billingClient.queryPurchasesAsync(any(), any()) }
        }
    }

    @Test
    fun `restore in progress prevents a competing credit checkout`() {
        withPendingBillingClient { manager, _ ->
            runBlocking {
                val restore = async(start = CoroutineStart.UNDISPATCHED) { manager.restorePurchases() }
                try {
                    manager.launchCreditPurchase(mockk<Activity>(), "credits_small")
                    assertThat(manager.creditPurchaseState.value).isInstanceOf(AppResult.Error::class.java)
                } finally {
                    restore.cancelAndJoin()
                }
            }
        }
    }

    private fun withPendingBillingClient(block: (BillingManager, BillingClient) -> Unit) {
        val billingClient = mockk<BillingClient>(relaxed = true)
        val builder = mockk<BillingClient.Builder>(relaxed = true)
        every { builder.setListener(any()) } returns builder
        every { builder.enablePendingPurchases(any()) } returns builder
        every { builder.enableAutoServiceReconnection() } returns builder
        every { builder.build() } returns billingClient
        every { billingClient.isReady } returns false
        every { billingClient.startConnection(any()) } returns Unit
        mockkStatic(BillingClient::class)
        try {
            every { BillingClient.newBuilder(any()) } returns builder
            val manager =
                BillingManager(
                    context = mockk<Context>(),
                    sessionRepository = mockk(),
                    creditsRepository = mockk(),
                    stringsProvider = mockk(relaxed = true),
                )
            try {
                block(manager, billingClient)
            } finally {
                manager.close()
            }
        } finally {
            unmockkStatic(BillingClient::class)
        }
    }

    @Test
    fun `restore reservation cannot be released by an unrelated purchase callback`() {
        val gate = BillingCheckoutGate()
        assertThat(gate.tryStart(PendingBillingFlow.RESTORE)).isTrue()
        gate.finish(PendingBillingFlow.PREMIUM)
        assertThat(gate.currentFlow()).isEqualTo(PendingBillingFlow.RESTORE)
        assertThat(gate.tryStart(PendingBillingFlow.CREDITS)).isFalse()
        gate.finish(PendingBillingFlow.RESTORE)
        assertThat(gate.tryStart(PendingBillingFlow.CREDITS)).isTrue()
    }

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
    fun `billing SDK failure codes become only fixed nonidentifying analytics categories`() {
        val reasons =
            mapOf(
                BillingClient.BillingResponseCode.USER_CANCELED to BillingFailureReason.USER_CANCELLED,
                BillingClient.BillingResponseCode.NETWORK_ERROR to BillingFailureReason.NETWORK_ERROR,
                BillingClient.BillingResponseCode.SERVICE_DISCONNECTED to BillingFailureReason.SERVICE_DISCONNECTED,
                BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE to BillingFailureReason.SERVICE_UNAVAILABLE,
                BillingClient.BillingResponseCode.BILLING_UNAVAILABLE to BillingFailureReason.BILLING_UNAVAILABLE,
                BillingClient.BillingResponseCode.ITEM_UNAVAILABLE to BillingFailureReason.ITEM_UNAVAILABLE,
                BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED to BillingFailureReason.ITEM_ALREADY_OWNED,
                BillingClient.BillingResponseCode.ITEM_NOT_OWNED to BillingFailureReason.ITEM_NOT_OWNED,
                BillingClient.BillingResponseCode.FEATURE_NOT_SUPPORTED to BillingFailureReason.FEATURE_NOT_SUPPORTED,
                BillingClient.BillingResponseCode.DEVELOPER_ERROR to BillingFailureReason.DEVELOPER_ERROR,
                BillingClient.BillingResponseCode.ERROR to BillingFailureReason.BILLING_ERROR,
            )
        reasons.forEach { (code, expected) ->
            assertThat(billingFailureReasonFromResponseCode(code)).isEqualTo(expected)
            assertThat(expected.analyticsValue).matches("[a-z_]+")
        }
    }

    @Test
    fun `unexpected SDK statuses are unknown not dynamically logged`() {
        assertThat(billingFailureReasonFromResponseCode(BillingClient.BillingResponseCode.OK))
            .isEqualTo(BillingFailureReason.UNKNOWN)
        assertThat(billingFailureReasonFromResponseCode(987654))
            .isEqualTo(BillingFailureReason.UNKNOWN)
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
    fun `preferred offer selects a describable trial ahead of paid base`() {
        val paid = listOf(PricingPhaseSummary(89_000_000L, "TRY 89.00", "P1M"))
        val trial =
            listOf(
                PricingPhaseSummary(0L, "Free", "P7D"),
                paid.single(),
            )
        assertThat(selectPreferredDisclosableOfferIndex(listOf(paid, trial))).isEqualTo(1)
        assertThat(selectPreferredDisclosableOfferIndex(listOf(trial, paid))).isEqualTo(0)
        assertThat(selectPreferredDisclosableOfferIndex(listOf(paid))).isEqualTo(0)
        assertThat(selectPreferredDisclosableOfferIndex(emptyList())).isEqualTo(-1)
    }

    @Test
    fun `unsupported free trial falls back to a valid paid base offer`() {
        val paid = listOf(PricingPhaseSummary(89_000_000L, "TRY 89.00", "P1M"))
        val unsupportedTrial =
            listOf(
                PricingPhaseSummary(0L, "Free", "P1M"),
                paid.single(),
            )
        assertThat(resolveDisplayPricing(unsupportedTrial)).isNull()
        assertThat(selectPreferredDisclosableOfferIndex(listOf(unsupportedTrial, paid))).isEqualTo(1)
        assertThat(selectPreferredDisclosableOfferIndex(listOf(unsupportedTrial))).isEqualTo(-1)
    }

    @Test
    fun `multiple or late free phases fail closed and cannot displace a paid base offer`() {
        val paid = PricingPhaseSummary(89_000_000L, "TRY 89.00", "P1M")
        val free = PricingPhaseSummary(0L, "Free", "P7D")
        val severalFree = listOf(free, free.copy(billingPeriod = "P3D"), paid)
        val freeAfterPaid =
            listOf(
                paid.copy(
                    recurrenceMode = com.android.billingclient.api.ProductDetails.RecurrenceMode.FINITE_RECURRING,
                    billingCycleCount = 1,
                ),
                free,
                paid,
            )
        val repeatingFree =
            listOf(
                free.copy(
                    recurrenceMode = com.android.billingclient.api.ProductDetails.RecurrenceMode.FINITE_RECURRING,
                    billingCycleCount = 3,
                ),
                paid,
            )
        listOf(severalFree, freeAfterPaid, repeatingFree).forEach { phases ->
            assertThat(resolveDisplayPricing(phases)).isNull()
            assertThat(selectPreferredDisclosableOfferIndex(listOf(phases, listOf(paid)))).isEqualTo(1)
        }
        val singleCycleTrial = repeatingFree.first().copy(billingCycleCount = 1)
        assertThat(resolveDisplayPricing(listOf(singleCycleTrial, paid))?.formattedPrice).isEqualTo("TRY 89.00")
    }

    @Test
    fun `rejected free phase schedule never exposes a misleading paywall trial`() {
        val free = PricingPhaseSummary(0L, "Free", "P7D")
        val paid = PricingPhaseSummary(89_000_000L, "TRY 89.00", "P1M")
        val unsupported = listOf(free, free.copy(billingPeriod = "P3D"), paid)
        assertThat(extractTrialDays(unsupported)).isEqualTo(7)
        assertThat(resolveDisclosableTrialDays(unsupported, resolveDisplayPricing(unsupported))).isNull()

        val unknown = listOf(free.copy(billingPeriod = "P1M"), paid)
        assertThat(resolveDisclosableTrialDays(unknown, resolveDisplayPricing(unknown))).isNull()

        val supported = listOf(free, paid)
        assertThat(resolveDisclosableTrialDays(supported, resolveDisplayPricing(supported))).isEqualTo(7)
        assertThat(resolveDisclosableTrialDays(listOf(paid), resolveDisplayPricing(listOf(paid)))).isNull()
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
    fun `renewal amount is not replaced with a discounted introductory price`() {
        val phases =
            listOf(
                PricingPhaseSummary(
                    priceAmountMicros = 0L,
                    formattedPrice = "Free",
                    billingPeriod = "P7D",
                ),
                PricingPhaseSummary(
                    priceAmountMicros = 49_000_000L,
                    formattedPrice = "TRY 49.00",
                    billingPeriod = "P1M",
                    recurrenceMode = com.android.billingclient.api.ProductDetails.RecurrenceMode.FINITE_RECURRING,
                    billingCycleCount = 2,
                ),
                PricingPhaseSummary(
                    priceAmountMicros = 89_000_000L,
                    formattedPrice = "TRY 89.00",
                    billingPeriod = "P1M",
                ),
            )
        assertThat(resolveDisplayPricing(phases)?.formattedPrice).isEqualTo("TRY 89.00")
        assertThat(resolveDisplayPricing(phases)?.priceAmountMicros).isEqualTo(89_000_000L)
        assertThat(resolveIntroductoryPricing(phases)?.formattedPrice).isEqualTo("TRY 49.00")
        assertThat(resolveIntroductoryPricing(phases)?.billingCycleCount).isEqualTo(2)
        assertThat(extractTrialDays(phases)).isEqualTo(7)
    }

    @Test
    fun `one-time introductory payment is distinguished from auto-renewal`() {
        val phases =
            listOf(
                PricingPhaseSummary(
                    priceAmountMicros = 15_000_000L,
                    formattedPrice = "TRY 15.00",
                    billingPeriod = "P1W",
                    recurrenceMode = com.android.billingclient.api.ProductDetails.RecurrenceMode.NON_RECURRING,
                ),
                PricingPhaseSummary(
                    priceAmountMicros = 35_000_000L,
                    formattedPrice = "TRY 35.00",
                    billingPeriod = "P1W",
                ),
            )
        assertThat(resolveDisplayPricing(phases)?.formattedPrice).isEqualTo("TRY 35.00")
        assertThat(resolveIntroductoryPricing(phases)?.formattedPrice).isEqualTo("TRY 15.00")
    }

    @Test
    fun `unrepresentable prices disable checkout instead of misrepresenting renewal`() {
        val finite = com.android.billingclient.api.ProductDetails.RecurrenceMode.FINITE_RECURRING
        val discount =
            PricingPhaseSummary(
                priceAmountMicros = 49_000_000L,
                formattedPrice = "TRY 49.00",
                billingPeriod = "P1M",
                recurrenceMode = finite,
                billingCycleCount = 2,
            )
        val monthly = PricingPhaseSummary(89_000_000L, "TRY 89.00", "P1M")
        assertThat(resolveDisplayPricing(listOf(discount))).isNull()
        assertThat(resolveDisplayPricing(listOf(discount, discount, monthly))).isNull()
        assertThat(resolveDisplayPricing(listOf(discount.copy(billingCycleCount = 0), monthly))).isNull()
        assertThat(resolveDisplayPricing(listOf(discount.copy(billingPeriod = "P1W"), monthly))).isNull()
        assertThat(resolveIntroductoryPricing(listOf(discount.copy(billingPeriod = "P1W"), monthly))).isNull()
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
