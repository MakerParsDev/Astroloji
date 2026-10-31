package com.parsfilo.astrology.feature.premium

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.data.repository.PremiumPlanUi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

/**
 * A real Android Compose paywall, but all prices and offer tokens below are synthetic.
 * Neither BillingClient nor any backend / Google Play checkout is invoked.
 */
class PremiumIntroductoryPricingDeviceTest {
    @get:Rule val composeRule = createComposeRule()

    private val resources get() = InstrumentationRegistry.getInstrumentation().targetContext.resources

    private fun plan(
        introPrice: String? = "$2.50",
        cycles: Int = 2,
        hasTrial: Boolean = false,
    ) = PremiumPlanUi(
        planId = "monthly-synthetic",
        productId = "premium_monthly",
        basePlanId = "monthly",
        title = "Synthetic Monthly",
        price = "$10.00",
        priceAmountMicros = 10_000_000L,
        introductoryPrice = introPrice,
        introductoryCycles = if (introPrice == null) 0 else cycles,
        billingPeriod = "P1M",
        offerToken = "synthetic-not-a-play-token",
        hasFreeTrial = hasTrial,
        trialDays = if (hasTrial) 7 else null,
    )

    private fun setPaywall(
        selected: PremiumPlanUi,
        trialDays: Int = 0,
        fontScale: Float = 2f,
        purchaseAttempts: AtomicInteger,
    ) {
        composeRule.setContent {
            CompositionLocalProvider(LocalDensity provides Density(density = 2f, fontScale = fontScale)) {
                MaterialTheme {
                    Box(Modifier.width(280.dp).height(700.dp)) {
                        androidx.compose.foundation.layout.Column(
                            Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
                        ) {
                            PremiumOfferCard(
                                uiState =
                                    PremiumUiState(
                                        isLoading = false,
                                        plans = listOf(selected),
                                        selectedPlanId = selected.planId,
                                        trialDays = trialDays,
                                    ),
                                plans = listOf(selected),
                                selected = selected,
                                purchaseReady = true,
                                callbacks =
                                    PremiumOfferCallbacks(
                                        onSelectPlan = {},
                                        onPurchase = { purchaseAttempts.incrementAndGet() },
                                        onContinueFree = {},
                                        onRestore = {},
                                    ),
                            )
                        }
                    }
                }
            }
        }
    }

    private fun assertBillingTermsAbovePurchase() {
        val preview = composeRule.onNodeWithTag("premium-value-preview").fetchSemanticsNode().boundsInRoot
        val plan = composeRule.onNodeWithTag("premium-plan-monthly-synthetic").fetchSemanticsNode().boundsInRoot
        assertTrue("Premium value must appear before the plan and price", preview.bottom <= plan.top)
        // At large font scale the purchase action starts below the viewport.
        // Scroll it into view before measuring its visible semantics bounds.
        composeRule.onNodeWithTag("premium-purchase-action").performScrollTo()
        val disclosure = composeRule.onNodeWithTag("premium-billing-disclosure").fetchSemanticsNode().boundsInRoot
        val purchase = composeRule.onNodeWithTag("premium-purchase-action").fetchSemanticsNode().boundsInRoot
        assertTrue(
            "Actual recurring/introductory terms must appear before the purchase action: $disclosure / $purchase",
            disclosure.bottom <= purchase.top,
        )
    }

    @Test
    fun discountedPhaseShowsBothIntroductoryAndRenewalPriceAtLargeFont() {
        val attempts = AtomicInteger(0)
        val plan = plan()
        setPaywall(plan, purchaseAttempts = attempts)

        val expectedDisclosure =
            resources.getString(
                R.string.premium_billing_disclosure_intro,
                "$2.50",
                2,
                resources.getString(R.string.premium_period_monthly),
                "$10.00",
                resources.getString(R.string.premium_period_monthly),
            )
        composeRule
            .onNodeWithText(
                resources.getString(R.string.premium_continue_with_price, "$2.50"),
            ).assertExists()
        composeRule.onNodeWithText(expectedDisclosure).performScrollTo().assertIsDisplayed()
        assertBillingTermsAbovePurchase()
        assertEquals(0, attempts.get())
    }

    @Test
    fun freeTrialThenIntroductoryPhaseExplainsAllThreeStages() {
        val attempts = AtomicInteger(0)
        setPaywall(plan(hasTrial = true), trialDays = 7, purchaseAttempts = attempts)

        val expectedDisclosure =
            resources.getString(
                R.string.premium_billing_disclosure_trial_intro,
                7,
                "$2.50",
                2,
                resources.getString(R.string.premium_period_monthly),
                "$10.00",
                resources.getString(R.string.premium_period_monthly),
            )
        composeRule
            .onNodeWithText(
                resources.getString(R.string.premium_start_trial_cta, 7),
            ).assertExists()
        composeRule.onNodeWithText(expectedDisclosure).performScrollTo().assertIsDisplayed()
        assertBillingTermsAbovePurchase()
        assertEquals(0, attempts.get())
    }

    @Test
    fun ordinaryRecurringSubscriptionKeepsTheExistingDisclosureAndCta() {
        val attempts = AtomicInteger(0)
        setPaywall(plan(introPrice = null), fontScale = 1f, purchaseAttempts = attempts)
        val expectedDisclosure =
            resources.getString(
                R.string.premium_billing_disclosure,
                "$10.00",
                resources.getString(R.string.premium_period_monthly),
            )
        composeRule
            .onNodeWithText(
                resources.getString(R.string.premium_continue_with_price, "$10.00"),
            ).assertExists()
        composeRule.onNodeWithText(expectedDisclosure).performScrollTo().assertIsDisplayed()
        assertBillingTermsAbovePurchase()
        assertEquals(0, attempts.get())
    }
}
