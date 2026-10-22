package com.parsfilo.astrology.feature.settings

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import org.junit.Rule
import org.junit.Test

class SettingsSegmentRowTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun sixLanguagesRemainClickableAndAnnounceSelectionAt320dpAndLargeText() {
        composeRule.setContent {
            var selected by remember { mutableStateOf("tr") }
            CompositionLocalProvider(LocalDensity provides Density(density = 1f, fontScale = 2f)) {
                MaterialTheme {
                    Box(Modifier.width(320.dp)) {
                        SettingsSegmentRow(
                            title = "Language",
                            options =
                                listOf(
                                    "tr" to "Türkçe",
                                    "en" to "English",
                                    "es" to "Español",
                                    "pt" to "Português",
                                    "de" to "Deutsch",
                                    "fr" to "Français",
                                ),
                            selected = selected,
                            onSelect = { selected = it },
                        )
                    }
                }
            }
        }
        composeRule.onNodeWithText("Français").assertExists()
        composeRule.onNodeWithText("Português").performClick()
        composeRule.onNodeWithText("Português").assertIsSelected()
    }

    @Test
    fun threeThemeOptionsRetainAccessibleExclusiveSelection() {
        composeRule.setContent {
            var selected by remember { mutableStateOf("system") }
            MaterialTheme {
                Box(Modifier.width(320.dp)) {
                    SettingsSegmentRow(
                        title = "Theme",
                        options = listOf("system" to "System", "light" to "Light", "dark" to "Dark"),
                        selected = selected,
                        onSelect = { selected = it },
                    )
                }
            }
        }
        composeRule.onNodeWithText("System").assertIsSelected()
        composeRule.onNodeWithText("Dark").performClick()
        composeRule.onNodeWithText("Dark").assertIsSelected()
    }
}
