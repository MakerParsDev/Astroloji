package com.parsfilo.astrology.feature.premium

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.platform.app.InstrumentationRegistry
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.data.repository.PaywallVariant
import com.parsfilo.astrology.core.data.repository.PremiumPlanUi
import org.junit.Rule
import org.junit.Test

class PremiumPlanSelectionTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun selectionAnnouncesExactlyOnePlanWithoutTriggeringAnyPurchase() {
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
}
