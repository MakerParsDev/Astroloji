package com.parsfilo.astrology.feature.settings

import android.graphics.Bitmap
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.input.InputMode
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.platform.LocalInputModeManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.pressKey
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Physical and emulator device checks for #127; no account or notification preference changes. */
@RunWith(AndroidJUnit4::class)
class ReminderHourDeviceAcceptanceTest {
    @get:Rule val rule = createComposeRule()

    private fun verify(width: Int) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val configuration = instrumentation.targetContext.resources.configuration
        assertTrue("Expected ${width}dp, got ${configuration.screenWidthDp}dp", kotlin.math.abs(configuration.screenWidthDp - width) <= 3)
        assertTrue("Test only at 100% or 200% font scale", kotlin.math.abs(configuration.fontScale - 1f) < 0.05f || kotlin.math.abs(configuration.fontScale - 2f) < 0.05f)

        var selections = 0
        rule.setContent {
            var selectedHour by remember { mutableIntStateOf(9) }
            var notificationsEnabled by remember { mutableStateOf(false) }
            MaterialTheme {
                Column(Modifier.fillMaxWidth().padding(8.dp)) {
                    Switch(
                        checked = notificationsEnabled,
                        onCheckedChange = { notificationsEnabled = it },
                        modifier = Modifier.testTag("notifications-switch"),
                    )
                    ReminderHourOptions(
                        selectedHour = selectedHour,
                        onSelectHour = { hour ->
                            selections += 1
                            selectedHour = hour
                        },
                    )
                }
            }
        }
        val hours = listOf("07:00", "08:00", "09:00", "20:00", "21:00")
        hours.forEach { hour ->
            rule.onNodeWithText(hour).assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.RadioButton))
            val height =
                rule
                    .onNodeWithText(hour)
                    .fetchSemanticsNode()
                    .boundsInRoot.height
            assertTrue("$hour touch target smaller than 48dp: $height", height >= 47f * instrumentation.targetContext.resources.displayMetrics.density)
        }
        rule.onNodeWithText("09:00").assertIsSelected()
        hours.filterNot { it == "09:00" }.forEach { rule.onNodeWithText(it).assertIsNotSelected() }
        rule.onNodeWithTag("notifications-switch").assertIsOff()
        rule.runOnIdle { assertEquals("Viewing reminder hours must not change settings", 0, selections) }

        rule.onNodeWithText("21:00").performClick()
        rule.onNodeWithText("21:00").assertIsSelected()
        hours.filterNot { it == "21:00" }.forEach { rule.onNodeWithText(it).assertIsNotSelected() }
        rule.onNodeWithTag("notifications-switch").assertIsOff()

        rule.onNodeWithTag("notifications-switch").performClick()
        rule.onNodeWithTag("notifications-switch").assertIsOn()
        rule.onNodeWithText("07:00").performClick()
        rule.onNodeWithText("07:00").assertIsSelected()
        hours.filterNot { it == "07:00" }.forEach { rule.onNodeWithText(it).assertIsNotSelected() }
        rule.onNodeWithTag("notifications-switch").assertIsOn()
        rule.runOnIdle { assertEquals(2, selections) }

        val screenshot = rule.onRoot().captureToImage().asAndroidBitmap()
        val colors = mutableSetOf<Int>()
        for (y in 0 until screenshot.height step 24) {
            for (x in 0 until screenshot.width step 24) colors.add(screenshot.getPixel(x, y))
        }
        val scale = if (configuration.fontScale > 1.5f) 200 else 100
        val directory = java.io.File(instrumentation.targetContext.getExternalFilesDir(null), "reminder-qa")
        assertTrue(directory.mkdirs() || directory.isDirectory)
        val file = java.io.File(directory, "reminder-${width}dp-$scale.png")
        file.outputStream().use { out -> assertTrue(screenshot.compress(Bitmap.CompressFormat.PNG, 100, out)) }
        screenshot.recycle()
        assertTrue("Blank reminder selection screenshot: ${colors.size} colors", colors.size > 2)
    }

    @Test fun keyboardFocusNavigation() {
        rule.setContent {
            LocalInputModeManager.current.requestInputMode(InputMode.Keyboard)
            var selected by remember { mutableIntStateOf(9) }
            MaterialTheme { ReminderHourOptions(selectedHour = selected, onSelectHour = { selected = it }) }
        }
        val first = rule.onNodeWithText("07:00")
        first.performSemanticsAction(SemanticsActions.RequestFocus)
        first.assertIsFocused()
        first.performKeyInput { pressKey(Key.DirectionRight) }
        val second = rule.onNodeWithText("08:00")
        second.assertIsFocused()
        second.performKeyInput { pressKey(Key.DirectionLeft) }
        first.assertIsFocused()
        first.performKeyInput { pressKey(Key.Tab) }
        second.assertIsFocused()
        second.performKeyInput { pressKey(Key.Enter) }
        rule.onNodeWithText("08:00").assertIsSelected()
        rule.onNodeWithText("09:00").assertIsNotSelected()
    }

    @Test fun width320() = verify(320)

    @Test fun width360() = verify(360)

    @Test fun width411() = verify(411)
}
