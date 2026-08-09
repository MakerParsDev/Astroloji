package com.parsfilo.astrology.feature.settings

import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.parsfilo.astrology.core.util.ZodiacSign
import com.parsfilo.astrology.ui.theme.AstrolojiTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class SettingsPremiumOverviewSemanticsTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun selectedSignIsExposedAsSelectedRadioButton() {
        composeRule.setContent {
            AstrolojiTheme(darkTheme = true) {
                SettingsPremiumOverview(
                    currentSign = ZodiacSign.ARIES,
                    language = "tr",
                    onChangeSign = {},
                )
            }
        }

        composeRule
            .onNodeWithText("♈ Koç")
            .assertIsSelected()
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.RadioButton))
    }
}
