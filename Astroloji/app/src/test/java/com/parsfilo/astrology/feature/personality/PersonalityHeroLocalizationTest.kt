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

    @Test fun allSignsHaveUserFacingNamesInSixLanguages() {
        val languages = listOf("tr", "en", "es", "pt", "de", "fr")
        assertThat(ZodiacSign.entries).hasSize(12)
        for (language in languages) {
            for (sign in ZodiacSign.entries) {
                val title = sign.localizedName(language)
                assertThat(title).isNotEmpty()
                assertThat(title).isNotEqualTo(sign.key)
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
