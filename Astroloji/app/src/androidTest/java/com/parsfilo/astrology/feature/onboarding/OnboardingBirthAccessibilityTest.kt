package com.parsfilo.astrology.feature.onboarding

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.platform.app.InstrumentationRegistry
import com.parsfilo.astrology.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class OnboardingBirthAccessibilityTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun citySuggestionExposesClickable48dpRowWithoutChangingStateUntilClicked() {
        val city =
            CitySuggestion(
                id = "test-izmir",
                name = "İzmir",
                country = "Türkiye",
                latitude = 38.42,
                longitude = 27.14,
                tzid = "Europe/Istanbul",
            )
        val selections = mutableListOf<CitySuggestion>()
        composeRule.setContent {
            MaterialTheme {
                CitySuggestionOption(city) { selections.add(it) }
            }
        }
        val option = composeRule.onNodeWithTag("city-suggestion-test-izmir")
        option.assertHasClickAction()
        val minimum = 48 * composeRule.density.density
        assertTrue(option.fetchSemanticsNode().boundsInRoot.height >= minimum)
        assertTrue(selections.isEmpty())
        option.performClick()
        composeRule.runOnIdle { assertEquals(listOf(city), selections) }
    }

    @Test
    fun birthTimeToggleReportsLocalizedLabelAndOnOffState() {
        composeRule.setContent {
            var known by remember { mutableStateOf(false) }
            MaterialTheme {
                BirthTimeKnownToggle(birthTimeKnown = known, onBirthTimeKnownChange = { known = it })
            }
        }
        val label =
            InstrumentationRegistry.getInstrumentation().targetContext.getString(
                R.string.onboarding_birth_time_known_label,
            )
        val toggle = composeRule.onNodeWithTag("birth-time-known-switch")
        toggle.assertContentDescriptionEquals(label)
        toggle.assertIsOff()
        toggle.performClick()
        toggle.assertIsOn()
        toggle.performClick()
        toggle.assertIsOff()
    }
}
