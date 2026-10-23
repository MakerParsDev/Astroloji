package com.parsfilo.astrology.feature.daily

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.domain.model.DailyHoroscope
import com.parsfilo.astrology.core.util.TimeUtils
import com.parsfilo.astrology.core.util.ZodiacSign
import com.parsfilo.astrology.ui.theme.AstrolojiTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.Locale

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class DailyPremiumHeroSemanticsTest {
    @get:Rule
    val composeRule = createComposeRule()

    private fun assertFullSummary(
        language: String,
        copy: String,
        width: Int = 320,
        fontScale: Float = 2f,
        darkTheme: Boolean = true,
    ) {
        composeRule.setContent {
            CompositionLocalProvider(LocalDensity provides Density(density = 1f, fontScale = fontScale)) {
                AstrolojiTheme(darkTheme = darkTheme) {
                    Box(Modifier.width(width.dp)) {
                        DailyPremiumSummary(
                            horoscope =
                                DailyHoroscope(
                                    date = "2026-10-24",
                                    sign = "taurus",
                                    language = language,
                                    short = copy,
                                    full = null,
                                    love = null,
                                    career = null,
                                    money = null,
                                    health = null,
                                    dailyTip = null,
                                    luckyNumber = 7,
                                    luckyColor = "gold",
                                    energy = 85,
                                    loveScore = 75,
                                    careerScore = 72,
                                    moneyScore = 64,
                                    healthScore = 80,
                                ),
                        )
                    }
                }
            }
        }

        // The summary must remain a complete, separately accessible text node,
        // rather than the oversize headline or a truncated preview.
        val renderedCopy = composeRule.onNodeWithText(copy)
        renderedCopy.assertExists()
        renderedCopy.assertIsDisplayed()
        // A full-width, laid-out paragraph rather than a hidden semantic string
        // next to the fixed-size icon. Screenshot acceptance remains separate.
        val bounds = renderedCopy.fetchSemanticsNode().boundsInRoot
        assertThat(bounds.width).isAtLeast((width - 60).toFloat())
        assertThat(bounds.height).isGreaterThan(0f)

        composeRule.onNodeWithText(ZodiacSign.TAURUS.localizedName(language)).assertExists()
        val expectedRange =
            ZodiacSign.TAURUS
                .localizedDateRange(language)
                .uppercase(Locale.forLanguageTag(TimeUtils.normalizeLanguageTag(language)))
        composeRule.onNodeWithText(expectedRange).assertExists()
    }

    @Test
    fun turkishLongSummaryAt320dpAnd200PercentFont() =
        assertFullSummary(
            "tr",
            "Boğa: Enerjini tek bir öncelikte toplamak bugün yolunu aydınlatabilir. " +
                "Birden çok sorumlulukla karşılaşırsan kendine zaman tanı ve küçük adımlarla ilerle.",
        )

    @Test
    fun englishShortSummaryInLightTheme() = assertFullSummary("en", "A focused day is ahead.", 320, 1f, false)

    @Test
    fun germanLongSummaryAt320dpAnd200PercentFont() =
        assertFullSummary(
            "de",
            "Stier: Konzentriere dich heute auf die wichtigsten Aufgaben und sei geduldig mit dir selbst. " +
                "Auch kleine Fortschritte bringen dich deinen langfristigen Zielen ein Stück näher.",
        )

    @Test
    fun frenchLongSummaryAt320dpAnd200PercentFont() =
        assertFullSummary(
            "fr",
            "Taureau : Avancez à votre rythme et prenez le temps de réfléchir avant toute décision. " +
                "Les échanges sincères vous aideront à comprendre vos priorités et vos envies.",
        )

    @Test
    fun spanishLongSummaryAt320dpAnd200PercentFont() =
        assertFullSummary(
            "es",
            "Tauro: Concéntrate en tus prioridades y reserva un momento para escuchar lo que necesitas. " +
                "Cada pequeño paso cuenta cuando decides avanzar con paciencia y claridad.",
        )

    @Test
    fun portugueseLongSummaryAt320dpAnd200PercentFont() =
        assertFullSummary(
            "pt",
            "Touro: Concentre sua energia nas prioridades de hoje e respeite o seu próprio ritmo. " +
                "Pequenas escolhas conscientes podem trazer mais clareza e confiança ao longo do dia.",
        )
}
