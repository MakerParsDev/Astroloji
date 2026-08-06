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
            planId = "premium_monthly:monthly:default",
            productId = "premium_monthly",
            basePlanId = "monthly",
            offerToken = "monthly-token",
            title = "Monthly",
            price = "₺394,99",
            priceAmountMicros = 394_990_000,
            billingPeriod = "P1M",
            displayPriority = 0,
        ),
        PremiumPlanUi(
            planId = "premium_weekly:weekly:default",
            productId = "premium_weekly",
            basePlanId = "weekly",
            offerToken = "weekly-token",
            title = "Weekly",
            price = "₺129,99",
            priceAmountMicros = 129_990_000,
            billingPeriod = "P1W",
            displayPriority = 1,
        ),
    )

private val screenshotState =
    PremiumUiState(
        isLoading = false,
        plans = screenshotPlans,
        selectedPlanId = "premium_monthly:monthly:default",
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
                selected = screenshotPlans.first(),
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
