package com.parsfilo.astrology.feature.daily

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.domain.model.DailyHoroscope
import com.parsfilo.astrology.core.util.TimeUtils
import com.parsfilo.astrology.ui.theme.AstrolojiTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class DailyScoreLargeFontTest {
    @get:Rule val rule = createComposeRule()

    private fun render(
        fontScale: Float,
        widthDp: Int,
        language: String,
    ) {
        rule.setContent {
            CompositionLocalProvider(LocalDensity provides Density(density = 1f, fontScale = fontScale)) {
                AstrolojiTheme(darkTheme = false) {
                    Box(Modifier.requiredWidth(widthDp.dp)) {
                        DailyScoresCard(
                            horoscope =
                                DailyHoroscope(
                                    date = "2026-10-24",
                                    sign = "taurus",
                                    language = language,
                                    short = "Synthetic QA content.",
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
                                ),
                        )
                    }
                }
            }
        }
    }

    private fun assertScoreLabelsAndValuesDoNotOverlap(language: String) {
        for ((label, score) in listOf("LOVE" to 73, "WORK" to 82, "MONEY" to 64, "HEALTH" to 85)) {
            val labelBounds = rule.onNodeWithText(label).fetchSemanticsNode().boundsInRoot
            val valueBounds =
                rule
                    .onNodeWithText(TimeUtils.formatPercentage(score, language))
                    .fetchSemanticsNode()
                    .boundsInRoot
            assertThat(valueBounds.left).isAtLeast(labelBounds.right)
            assertThat(valueBounds.height).isGreaterThan(0f)
            assertThat(valueBounds.width).isGreaterThan(0f)
        }
    }

    @Test fun englishAt320dpAnd200PercentKeepsEveryPercentageReadable() {
        render(fontScale = 2f, widthDp = 320, language = "en")
        assertScoreLabelsAndValuesDoNotOverlap("en")
        val energyBottom =
            rule
                .onNodeWithText("Energy")
                .fetchSemanticsNode()
                .boundsInRoot.bottom
        val firstScoreTop =
            rule
                .onNodeWithText("LOVE")
                .fetchSemanticsNode()
                .boundsInRoot.top
        assertThat(firstScoreTop).isGreaterThan(energyBottom)
    }

    @Test fun turkishPercentageFormatAt320dpAnd200PercentRemainsIntact() {
        render(fontScale = 2f, widthDp = 320, language = "tr")
        assertScoreLabelsAndValuesDoNotOverlap("tr")
    }

    @Test fun normalScaleKeepsEnergyAndScoresSideBySide() {
        render(fontScale = 1f, widthDp = 400, language = "en")
        assertScoreLabelsAndValuesDoNotOverlap("en")
        val energyRight =
            rule
                .onNodeWithText("Energy")
                .fetchSemanticsNode()
                .boundsInRoot.right
        val scoreLeft =
            rule
                .onNodeWithText("LOVE")
                .fetchSemanticsNode()
                .boundsInRoot.left
        assertThat(scoreLeft).isGreaterThan(energyRight)
    }
}
