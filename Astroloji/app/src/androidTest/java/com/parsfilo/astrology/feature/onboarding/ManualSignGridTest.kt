package com.parsfilo.astrology.feature.onboarding

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.dp
import com.parsfilo.astrology.core.util.ZodiacSign
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class ManualSignGridTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun compactScrollableOnboardingAllowsSelectingLastSign() {
        var picked: ZodiacSign? = null
        composeRule.setContent {
            MaterialTheme {
                Column(
                    modifier =
                        Modifier
                            .width(320.dp)
                            .height(420.dp)
                            .verticalScroll(rememberScrollState()),
                ) {
                    ManualSignGrid(
                        selected = null,
                        language = "en",
                        onSelectSign = { picked = it },
                    )
                }
            }
        }

        composeRule.onNodeWithText("Aries").assertExists()
        composeRule.onNodeWithText("Pisces").performScrollTo().performClick()
        composeRule.runOnIdle { assertEquals(ZodiacSign.PISCES, picked) }
    }
}
