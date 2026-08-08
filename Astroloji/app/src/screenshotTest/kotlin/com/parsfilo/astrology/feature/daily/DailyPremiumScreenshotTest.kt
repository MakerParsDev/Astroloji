@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.daily

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import com.parsfilo.astrology.core.domain.model.DailyHoroscope
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.ui.theme.AstrolojiTheme

private val dailyGolden =
    DailyHoroscope(
        date = "2026-08-08",
        sign = "aries",
        language = "tr",
        short = "Bugün cesaretin ve netliğin öne çıkıyor.",
        full = "Yeni adımlar için güçlü bir gün.",
        love = "Duygular açık.",
        career = "Odak güçlü.",
        money = "Planlı ilerle.",
        health = "Dengeni koru.",
        dailyTip = "Önceliklerini sadeleştir.",
        luckyNumber = 7,
        luckyColor = "Kırmızı",
        energy = 90,
        loveScore = 75,
        careerScore = 82,
        moneyScore = 68,
        healthScore = 80,
    )

@PreviewTest
@Preview(
    name = "Premium daily Turkish",
    widthDp = 360,
    heightDp = 680,
    locale = "tr-rTR",
    showBackground = true,
)
@Composable
fun DailyPremiumTurkishScreenshot() {
    AstrolojiTheme(darkTheme = true) {
        CosmicBackground(modifier = Modifier.fillMaxSize()) {
            DailyPremiumSummary(
                horoscope = dailyGolden,
                modifier = Modifier.padding(16.dp),
            )
        }
    }
}
