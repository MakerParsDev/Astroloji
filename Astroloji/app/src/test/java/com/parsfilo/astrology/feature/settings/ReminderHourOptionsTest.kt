package com.parsfilo.astrology.feature.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ReminderHourOptionsTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun fiveHoursExposeExactlyOneRadioSelectionAt320dpAndLargeFont() {
        composeRule.setContent {
            var selectedHour by remember { mutableStateOf(9) }
            var notificationsEnabled by remember { mutableStateOf(false) }
            CompositionLocalProvider(LocalDensity provides Density(density = 1f, fontScale = 2f)) {
                MaterialTheme {
                    Column(Modifier.width(320.dp)) {
                        Switch(
                            checked = notificationsEnabled,
                            onCheckedChange = { notificationsEnabled = it },
                            modifier = Modifier.testTag("notifications-switch"),
                        )
                        ReminderHourOptions(
                            selectedHour = selectedHour,
                            onSelectHour = { selectedHour = it },
                        )
                    }
                }
            }
        }

        val hours = listOf("07:00", "08:00", "09:00", "20:00", "21:00")
        hours.forEach { time ->
            composeRule.onNodeWithText(time).assertExists()
            composeRule.onNodeWithText(time).assert(
                SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.RadioButton),
            )
        }
        composeRule.onNodeWithText("09:00").assertIsSelected()
        hours.filterNot { it == "09:00" }.forEach {
            composeRule.onNodeWithText(it).assertIsNotSelected()
        }

        composeRule.onNodeWithText("21:00").performClick()
        composeRule.onNodeWithText("21:00").assertIsSelected()
        hours.filterNot { it == "21:00" }.forEach {
            composeRule.onNodeWithText(it).assertIsNotSelected()
        }
        composeRule.onNodeWithTag("notifications-switch").assertIsOff()
    }

    @Test
    fun previouslyStoredCustomHourRemainsSelectedWithoutImplicitlySavingAnotherTime() {
        var changeCalls = 0
        composeRule.setContent {
            var selectedHour by remember { mutableStateOf(10) }
            MaterialTheme {
                Column(Modifier.width(320.dp)) {
                    ReminderHourOptions(
                        selectedHour = selectedHour,
                        onSelectHour = {
                            changeCalls += 1
                            selectedHour = it
                        },
                    )
                }
            }
        }

        composeRule.onNodeWithText("10:00").assertIsSelected()
        composeRule.onNodeWithText("09:00").assertIsNotSelected()
        composeRule.runOnIdle { assertEquals(0, changeCalls) }

        composeRule.onNodeWithText("07:00").performClick()
        composeRule.onNodeWithText("07:00").assertIsSelected()
        composeRule.onNodeWithText("10:00").assertDoesNotExist()
        composeRule.runOnIdle { assertEquals(1, changeCalls) }
    }
}
