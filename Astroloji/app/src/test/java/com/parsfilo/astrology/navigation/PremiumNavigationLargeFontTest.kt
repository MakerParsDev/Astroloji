package com.parsfilo.astrology.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredWidth
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

    private fun render(
        fontScale: Float,
        widthDp: Int = 400,
    ) {
        rule.setContent {
            CompositionLocalProvider(LocalDensity provides Density(density = 1f, fontScale = fontScale)) {
                AstrolojiTheme(darkTheme = false) {
                    Box(Modifier.requiredWidth(widthDp.dp)) {
                        PremiumNavigationBar(
                            listOf(
                                PremiumNavigationItem("Home", Icons.Outlined.Home, true, {}, compactLabel = "Home"),
                                PremiumNavigationItem(
                                    "Compatibility",
                                    Icons.Outlined.AutoAwesome,
                                    false,
                                    {},
                                    compactLabel = "Match",
                                ),
                                PremiumNavigationItem("Profile", Icons.Outlined.Person, false, {}, compactLabel = "Me"),
                                PremiumNavigationItem("Premium", Icons.Outlined.Star, false, {}, compactLabel = "Pro"),
                            ),
                        )
                    }
                }
            }
        }
    }

    @Test fun largeTextRetainsVisibleNavigationDestinationsAndFullAccessibilityNames() {
        render(2f, widthDp = 320)
        val labels =
            mapOf(
                "Home" to "Home",
                "Compatibility" to "Match",
                "Profile" to "Me",
                "Premium" to "Pro",
            )
        for ((full, compact) in labels) {
            rule.onNodeWithContentDescription(full, useUnmergedTree = true).assertExists()
            rule.onNodeWithText(compact, useUnmergedTree = true).assertExists()
        }
        rule.onNodeWithText("Compatibility", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test fun compactLabelsStayVisibleAt180PercentTextScale() {
        render(1.8f, widthDp = 320)
        for (text in listOf("Home", "Match", "Me", "Pro")) {
            rule.onNodeWithText(text, useUnmergedTree = true).assertExists()
        }
    }

    @Test fun compact320dpNavigationKeepsVisibleLabelsAtNormalFontScale() {
        render(1f, widthDp = 320)
        for (name in listOf("Home", "Compatibility", "Profile", "Premium")) {
            rule.onNodeWithText(name, useUnmergedTree = true).assertExists()
        }
    }

    @Test fun normalTextScaleRetainsVisibleLabels() {
        render(1f, widthDp = 400)
        for (name in listOf("Home", "Compatibility", "Profile", "Premium")) {
            rule.onNodeWithText(name, useUnmergedTree = true).assertExists()
        }
    }
}
