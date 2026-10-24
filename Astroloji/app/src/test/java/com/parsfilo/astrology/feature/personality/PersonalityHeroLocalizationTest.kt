package com.parsfilo.astrology.feature.personality

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
import com.parsfilo.astrology.core.domain.model.PersonalityReport
import com.parsfilo.astrology.core.util.ZodiacSign
import com.parsfilo.astrology.ui.theme.AstrolojiTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PersonalityHeroLocalizationTest {
    @get:Rule val rule = createComposeRule()

    // Independent expectations, in ZodiacSign enum order; catches wrong-language fallbacks.
    private val expectedNames =
        mapOf(
            "tr" to
                listOf(
                    "Koç",
                    "Boğa",
                    "İkizler",
                    "Yengeç",
                    "Aslan",
                    "Başak",
                    "Terazi",
                    "Akrep",
                    "Yay",
                    "Oğlak",
                    "Kova",
                    "Balık",
                ),
            "en" to
                listOf(
                    "Aries",
                    "Taurus",
                    "Gemini",
                    "Cancer",
                    "Leo",
                    "Virgo",
                    "Libra",
                    "Scorpio",
                    "Sagittarius",
                    "Capricorn",
                    "Aquarius",
                    "Pisces",
                ),
            "es" to
                listOf(
                    "Aries",
                    "Tauro",
                    "Géminis",
                    "Cáncer",
                    "Leo",
                    "Virgo",
                    "Libra",
                    "Escorpio",
                    "Sagitario",
                    "Capricornio",
                    "Acuario",
                    "Piscis",
                ),
            "pt" to
                listOf(
                    "Áries",
                    "Touro",
                    "Gêmeos",
                    "Câncer",
                    "Leão",
                    "Virgem",
                    "Libra",
                    "Escorpião",
                    "Sagitário",
                    "Capricórnio",
                    "Aquário",
                    "Peixes",
                ),
            "de" to
                listOf(
                    "Widder",
                    "Stier",
                    "Zwillinge",
                    "Krebs",
                    "Löwe",
                    "Jungfrau",
                    "Waage",
                    "Skorpion",
                    "Schütze",
                    "Steinbock",
                    "Wassermann",
                    "Fische",
                ),
            "fr" to
                listOf(
                    "Bélier",
                    "Taureau",
                    "Gémeaux",
                    "Cancer",
                    "Lion",
                    "Vierge",
                    "Balance",
                    "Scorpion",
                    "Sagittaire",
                    "Capricorne",
                    "Verseau",
                    "Poissons",
                ),
        )

    @Test fun allSignsHaveUserFacingNamesInSixLanguages() {
        assertThat(ZodiacSign.entries).hasSize(12)
        for ((language, names) in expectedNames) {
            assertThat(names).hasSize(ZodiacSign.entries.size)
            for ((sign, expectedName) in ZodiacSign.entries.zip(names)) {
                assertThat(sign.localizedName(language)).isEqualTo(expectedName)
                assertThat(ZodiacSign.fromKey(sign.key)).isEqualTo(sign)
            }
        }
    }

    @Test fun turkishTaurusAt320dpWith200PercentFontNeverShowsRawSlug() = checkHero("tr", "Boğa")

    @Test fun germanTaurusAt320dpWith200PercentFontNeverShowsRawSlug() = checkHero("de", "Stier")

    private fun checkHero(
        language: String,
        expectedName: String,
    ) {
        val report =
            PersonalityReport(
                sign = "taurus",
                language = language,
                summary = "Meaningful report",
                deepAnalysis = null,
                strengths = emptyList(),
                weaknesses = emptyList(),
                idealPartners = emptyList(),
                careerFit = emptyList(),
                element = "Earth",
                planet = "Venus",
                color = "green",
                stone = "emerald",
            )
        rule.setContent {
            CompositionLocalProvider(LocalDensity provides Density(density = 1f, fontScale = 2f)) {
                AstrolojiTheme(darkTheme = true) {
                    Box(Modifier.width(320.dp)) { PersonalityHero(report) }
                }
            }
        }
        val node = rule.onNodeWithText(expectedName)
        node.assertExists()
        node.assertIsDisplayed()
        rule.onNodeWithText("taurus").assertDoesNotExist()
        assertThat(node.fetchSemanticsNode().boundsInRoot.height).isGreaterThan(0f)
    }
}
