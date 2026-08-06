@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.premium

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import com.parsfilo.astrology.core.data.repository.PremiumPlanUi
import com.parsfilo.astrology.ui.theme.AstrolojiTheme

private val screenshotPlans =
    listOf(
        PremiumPlanUi(
            planId = "monthly",
            productId = "premium_monthly",
            title = "Monthly",
            price = "₺79.99",
            priceAmountMicros = 79_990_000,
            billingPeriod = "P1M",
            displayPriority = 1,
        ),
        PremiumPlanUi(
            planId = "yearly",
            productId = "premium_yearly",
            title = "Yearly",
            price = "₺599.99",
            priceAmountMicros = 599_990_000,
            hasFreeTrial = true,
            trialDays = 7,
            billingPeriod = "P1Y",
            displayPriority = 0,
        ),
    )

private val screenshotState =
    PremiumUiState(
        isLoading = false,
        plans = screenshotPlans,
        selectedPlanId = "yearly",
        trialDays = 7,
        yearlySavingsPercent = 37,
        paywallSource = "daily_lock",
    )

private val screenshotCallbacks =
    PremiumOfferCallbacks(
        onSelectPlan = {},
        onPurchase = {},
        onContinueFree = {},
        onRestore = {},
    )

@Composable
private fun PremiumOfferGolden() {
    AstrolojiTheme(darkTheme = true) {
        Box(
            modifier =
                Modifier
                    .fillMaxSize()
                    .background(Color(0xFF090A16))
                    .padding(16.dp),
        ) {
            PremiumOfferCard(
                uiState = screenshotState,
                plans = screenshotPlans,
                selected = screenshotPlans.last(),
                purchaseReady = true,
                callbacks = screenshotCallbacks,
            )
        }
    }
}

@PreviewTest
@Preview(
    name = "Premium offer English",
    widthDp = 360,
    heightDp = 800,
    locale = "en",
    showBackground = true,
)
@Composable
fun PremiumOfferEnglishScreenshot() {
    PremiumOfferGolden()
}

@PreviewTest
@Preview(
    name = "Premium offer Turkish",
    widthDp = 360,
    heightDp = 800,
    locale = "tr-rTR",
    showBackground = true,
)
@Composable
fun PremiumOfferTurkishScreenshot() {
    PremiumOfferGolden()
}
