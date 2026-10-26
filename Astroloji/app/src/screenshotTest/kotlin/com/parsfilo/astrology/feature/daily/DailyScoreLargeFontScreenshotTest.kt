@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.daily

import androidx.compose.foundation.layout.Box
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

private val scoreFixture =
    DailyHoroscope(
        date = "2026-10-24",
        sign = "taurus",
        language = "en",
        short = "Daily test only.",
        full = null,
        love = null,
        career = null,
        money = null,
        health = null,
        dailyTip = null,
        luckyNumber = 7,
        luckyColor = "Gold",
        energy = 91,
        loveScore = 73,
        careerScore = 82,
        moneyScore = 64,
        healthScore = 85,
    )

@PreviewTest
@Preview(name = "Scores compact large font light", widthDp = 320, heightDp = 750, fontScale = 2f, showBackground = true)
@Composable
fun DailyScoresLargeFontLightScreenshot() {
    AstrolojiTheme(darkTheme = false) {
        CosmicBackground(Modifier.fillMaxSize()) {
            Box(Modifier.padding(16.dp)) {
                DailyScoresCard(scoreFixture)
            }
        }
    }
}

@PreviewTest
@Preview(name = "Scores compact large font dark", widthDp = 320, heightDp = 750, fontScale = 2f, showBackground = true)
@Composable
fun DailyScoresLargeFontDarkScreenshot() {
    AstrolojiTheme(darkTheme = true) {
        CosmicBackground(Modifier.fillMaxSize()) {
            Box(Modifier.padding(16.dp)) {
                DailyScoresCard(scoreFixture)
            }
        }
    }
}
