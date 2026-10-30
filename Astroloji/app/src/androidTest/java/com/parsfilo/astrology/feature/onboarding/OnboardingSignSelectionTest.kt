package com.parsfilo.astrology.feature.onboarding

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.util.ZodiacSign
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class OnboardingSignSelectionTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun canChooseSignWithoutBirthDateOrCityAndHideUnusedOptions() {
        var selectedSign: ZodiacSign? = null
        var manuallyChoosing = false
        composeRule.setContent {
            var selected by remember { mutableStateOf<ZodiacSign?>(null) }
            var expanded by remember { mutableStateOf(false) }
            MaterialTheme {
                Column(
                    modifier = Modifier.width(320.dp).height(440.dp).verticalScroll(rememberScrollState()),
                ) {
                    OnboardingSignSelection(
                        hasBirthDate = false,
                        selected = selected,
                        manualSelectionEnabled = expanded,
                        language = "en",
                        onManualSelectionChange = {
                            expanded = it
                            manuallyChoosing = it
                        },
                        onSelectSign = {
                            selected = it
                            selectedSign = it
                        },
                    )
                }
            }
        }
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        composeRule.onNodeWithText(ctx.getString(R.string.onboarding_choose_sign_without_birthdate)).assertExists()
        composeRule.onNodeWithText("Aries").assertDoesNotExist()
        composeRule.onNodeWithText(ctx.getString(R.string.onboarding_choose_sign_without_birthdate)).performClick()
        composeRule.onNodeWithText("Aries").performClick()
        composeRule.runOnIdle {
            assertEquals(ZodiacSign.ARIES, selectedSign)
            assertEquals(true, manuallyChoosing)
        }
        composeRule.onNodeWithText(ctx.getString(R.string.onboarding_detected_sign_label)).assertDoesNotExist()
        composeRule.onNodeWithText(ctx.getString(R.string.onboarding_hide_sign_choices)).performClick()
        composeRule.runOnIdle { assertEquals(false, manuallyChoosing) }
    }

    @Test
    fun birthDateSuggestionStillAllowsChoosingDifferentSign() {
        var chosen: ZodiacSign? = null
        composeRule.setContent {
            var selected by remember { mutableStateOf(ZodiacSign.ARIES) }
            var expanded by remember { mutableStateOf(false) }
            MaterialTheme {
                Column(
                    modifier = Modifier.width(320.dp).height(440.dp).verticalScroll(rememberScrollState()),
                ) {
                    OnboardingSignSelection(
                        hasBirthDate = true,
                        selected = selected,
                        manualSelectionEnabled = expanded,
                        language = "en",
                        onManualSelectionChange = { expanded = it },
                        onSelectSign = {
                            selected = it
                            chosen = it
                        },
                    )
                }
            }
        }
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        composeRule.onNodeWithText(ctx.getString(R.string.onboarding_detected_sign_label)).assertExists()
        composeRule.onNodeWithText(ctx.getString(R.string.onboarding_choose_sign_without_birthdate)).assertDoesNotExist()
        composeRule.onNodeWithText(ctx.getString(R.string.onboarding_show_manual_selection)).performClick()
        composeRule.onNodeWithText("Taurus").performClick()
        composeRule.runOnIdle { assertEquals(ZodiacSign.TAURUS, chosen) }
    }
}
