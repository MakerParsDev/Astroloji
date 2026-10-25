package com.parsfilo.astrology.feature.premium

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.data.repository.PaywallVariant
import com.parsfilo.astrology.core.data.repository.PremiumPlanUi
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class PremiumPlanSelectionTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun selectionAnnouncesExactlyOnePlanWithoutTriggeringAnyPurchase() {
        val (monthly, yearly) = samplePlans()
        composeRule.setContent {
            var selected by remember { mutableStateOf("monthly") }
            MaterialTheme {
                PremiumPlanSelector(
                    plans = listOf(monthly, yearly),
                    selectedPlanId = selected,
                    variant = PaywallVariant.MONTHLY_FIRST,
                    onSelect = { selected = it },
                )
            }
        }

        // PremiumPlanSelector displays localized cadence resources, not plan.title.
        // Resolve them from the current device locale (e.g. Aylık/Yıllık in Turkish).
        val resources = InstrumentationRegistry.getInstrumentation().targetContext.resources
        val monthlyLabel = resources.getString(R.string.premium_monthly_label)
        val yearlyLabel = resources.getString(R.string.premium_yearly_label)
        composeRule.onNodeWithText(monthlyLabel).assertIsSelected()
        composeRule.onNodeWithText(yearlyLabel).assertIsNotSelected()
        composeRule.onNodeWithText(yearlyLabel).performClick()
        composeRule.onNodeWithText(monthlyLabel).assertIsNotSelected()
        composeRule.onNodeWithText(yearlyLabel).assertIsSelected()
    }

    @Test
    fun narrowPhoneWithLargeTextStacksOptionsAndPreservesSelectionSemantics() {
        val (monthly, yearly) = samplePlans()
        composeRule.setContent {
            var selected by remember { mutableStateOf("monthly") }
            CompositionLocalProvider(LocalDensity provides Density(density = 2f, fontScale = 2f)) {
                MaterialTheme {
                    Box(Modifier.width(280.dp)) {
                        PremiumPlanSelector(
                            plans = listOf(monthly, yearly),
                            selectedPlanId = selected,
                            variant = PaywallVariant.MONTHLY_FIRST,
                            onSelect = { selected = it },
                        )
                    }
                }
            }
        }

        val monthlyNode = composeRule.onNodeWithTag("premium-plan-monthly")
        val yearlyNode = composeRule.onNodeWithTag("premium-plan-yearly")
        monthlyNode.assertIsSelected()
        yearlyNode.assertIsNotSelected()
        val first = monthlyNode.fetchSemanticsNode().boundsInRoot
        val second = yearlyNode.fetchSemanticsNode().boundsInRoot
        assertTrue("Premium options must stack on small/large-font screens", second.top >= first.bottom)
        assertTrue("Premium options should share their left alignment", kotlin.math.abs(first.left - second.left) < 2f)

        yearlyNode.performClick()
        yearlyNode.assertIsSelected()
        monthlyNode.assertIsNotSelected()
    }

    @Test
    fun wideScreenWithDefaultFontKeepsTwoColumnPlanOptions() {
        val (monthly, yearly) = samplePlans()
        composeRule.setContent {
            CompositionLocalProvider(LocalDensity provides Density(density = 2f, fontScale = 1f)) {
                MaterialTheme {
                    Box(Modifier.width(550.dp)) {
                        PremiumPlanSelector(
                            plans = listOf(monthly, yearly),
                            selectedPlanId = "monthly",
                            variant = PaywallVariant.MONTHLY_FIRST,
                            onSelect = {},
                        )
                    }
                }
            }
        }
        val first = composeRule.onNodeWithTag("premium-plan-monthly").fetchSemanticsNode().boundsInRoot
        val second = composeRule.onNodeWithTag("premium-plan-yearly").fetchSemanticsNode().boundsInRoot
        assertTrue("Wide-screen plans should remain side by side", second.left >= first.right)
        composeRule.onNodeWithTag("premium-plan-monthly").assertIsSelected()
        composeRule.onNodeWithTag("premium-plan-yearly").assertIsNotSelected()
    }

    private fun samplePlans(): Pair<PremiumPlanUi, PremiumPlanUi> {
        val monthly =
            PremiumPlanUi(
                planId = "monthly",
                productId = "premium_monthly",
                basePlanId = "monthly",
                billingPeriod = "P1M",
                title = "Monthly",
                price = "$4.99",
                offerToken = "synthetic-only",
            )
        val yearly =
            PremiumPlanUi(
                planId = "yearly",
                productId = "premium_yearly",
                basePlanId = "yearly",
                billingPeriod = "P1Y",
                title = "Yearly",
                price = "$29.99",
                offerToken = "synthetic-only",
            )
        return monthly to yearly
    }
}
