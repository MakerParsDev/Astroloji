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

    // Fixed expectations ordered tr/en/es/pt/de/fr, independent of the production fields.
    private val expectedNames =
        mapOf(
            ZodiacSign.ARIES to "Koç|Aries|Aries|Áries|Widder|Bélier",
            ZodiacSign.TAURUS to "Boğa|Taurus|Tauro|Touro|Stier|Taureau",
            ZodiacSign.GEMINI to "İkizler|Gemini|Géminis|Gêmeos|Zwillinge|Gémeaux",
            ZodiacSign.CANCER to "Yengeç|Cancer|Cáncer|Câncer|Krebs|Cancer",
            ZodiacSign.LEO to "Aslan|Leo|Leo|Leão|Löwe|Lion",
            ZodiacSign.VIRGO to "Başak|Virgo|Virgo|Virgem|Jungfrau|Vierge",
            ZodiacSign.LIBRA to "Terazi|Libra|Libra|Libra|Waage|Balance",
            ZodiacSign.SCORPIO to "Akrep|Scorpio|Escorpio|Escorpião|Skorpion|Scorpion",
            ZodiacSign.SAGITTARIUS to "Yay|Sagittarius|Sagitario|Sagitário|Schütze|Sagittaire",
            ZodiacSign.CAPRICORN to "Oğlak|Capricorn|Capricornio|Capricórnio|Steinbock|Capricorne",
            ZodiacSign.AQUARIUS to "Kova|Aquarius|Acuario|Aquário|Wassermann|Verseau",
            ZodiacSign.PISCES to "Balık|Pisces|Piscis|Peixes|Fische|Poissons",
        )

    @Test fun allSignsHaveUserFacingNamesInSixLanguages() {
        val languages = listOf("tr", "en", "es", "pt", "de", "fr")
        assertThat(expectedNames.keys).containsExactlyElementsIn(ZodiacSign.entries)
        for ((sign, translations) in expectedNames) {
            val names = translations.split('|')
            assertThat(names).hasSize(languages.size)
            for ((language, expectedName) in languages.zip(names)) {
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
