package com.parsfilo.astrology.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Star
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.parsfilo.astrology.ui.theme.AstrolojiTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PremiumNavigationLargeFontTest {
    @get:Rule val rule = createComposeRule()

    private fun render(fontScale: Float) {
        rule.setContent {
            CompositionLocalProvider(LocalDensity provides Density(density = 1f, fontScale = fontScale)) {
                AstrolojiTheme(darkTheme = false) {
                    Box(Modifier.width(320.dp)) {
                        PremiumNavigationBar(
                            listOf(
                                PremiumNavigationItem("Home", Icons.Outlined.Home, true, {}),
                                PremiumNavigationItem("Compatibility", Icons.Outlined.AutoAwesome, false, {}),
                                PremiumNavigationItem("Profile", Icons.Outlined.Person, false, {}),
                                PremiumNavigationItem("Premium", Icons.Outlined.Star, false, {}),
                            ),
                        )
                    }
                }
            }
        }
    }

    @Test fun fullAccessibleLabelsRemainWhenVisualLabelsAreHiddenAt200Percent() {
        render(2f)
        for (name in listOf("Home", "Compatibility", "Profile", "Premium")) {
            rule.onNodeWithContentDescription(name, useUnmergedTree = true).assertExists()
            rule.onNodeWithText(name, useUnmergedTree = true).assertDoesNotExist()
        }
    }

    @Test fun normalTextScaleRetainsVisibleLabels() {
        render(1f)
        for (name in listOf("Home", "Compatibility", "Profile", "Premium")) {
            rule.onNodeWithText(name, useUnmergedTree = true).assertExists()
        }
    }
}
