@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.home

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import com.parsfilo.astrology.core.domain.model.DailyHoroscope
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.util.ZodiacSign
import com.parsfilo.astrology.ui.theme.AstrolojiTheme

private val homeGoldenDaily =
    DailyHoroscope(
        date = "2026-08-08",
        sign = "aries",
        language = "tr",
        short = "Cesaretin ve kararlılığın bugün öne çıkıyor.",
        full = "Yeni adımlar için enerjin güçlü. İletişimde net kal ve günün ritmini sen belirle.",
        love = "Duygular açık.",
        career = "Odak güçlü.",
        money = "Planlı ilerle.",
        health = "Dengeni koru.",
        dailyTip = "Önemli kararlarını günün ilk yarısında tamamla.",
        luckyNumber = 7,
        luckyColor = "Kırmızı",
        energy = 90,
        loveScore = 75,
        careerScore = 82,
        moneyScore = 68,
        healthScore = 80,
    )

@Composable
private fun HomePremiumGolden() {
    AstrolojiTheme(darkTheme = true) {
        CosmicBackground(modifier = Modifier.fillMaxSize()) {
            HomePremiumDashboard(
                sign = ZodiacSign.fromKey("aries"),
                language = "tr",
                greeting = "İyi akşamlar",
                dateLabel = "8 Ağustos 2026",
                streakCount = 7,
                daily = homeGoldenDaily,
                onOpenDaily = {},
                onOpenWeekly = {},
                onOpenMonthly = {},
                onOpenPersonality = {},
                onOpenPremium = {},
                modifier = Modifier.fillMaxSize().padding(16.dp),
            )
        }
    }
}

@PreviewTest
@Preview(
    name = "Premium home Turkish",
    widthDp = 360,
    heightDp = 1100,
    locale = "tr-rTR",
    showBackground = true,
)
@Composable
fun HomePremiumTurkishScreenshot() {
    HomePremiumGolden()
}
