package com.parsfilo.astrology.feature.home

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import com.parsfilo.astrology.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class MoodSelectionAccessibilityTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun everyEmojiHasLocalizedAccessibleNameAnd48dpTouchTarget() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val labels =
            listOf(
                "great" to R.string.home_mood_option_great,
                "good" to R.string.home_mood_option_good,
                "neutral" to R.string.home_mood_option_neutral,
                "low" to R.string.home_mood_option_low,
                "stressed" to R.string.home_mood_option_stressed,
            )
        val selected = mutableListOf<String>()
        composeRule.setContent {
            MaterialTheme {
                MoodSelectionOptions { selected.add(it) }
            }
        }
        val density = composeRule.density.density
        labels.forEach { (value, labelRes) ->
            val node = composeRule.onNodeWithTag("mood-option-$value")
            node.assertContentDescriptionEquals(context.getString(labelRes))
            node.assertHasClickAction()
            val bounds = node.fetchSemanticsNode().boundsInRoot
            assertTrue("$value must have 48dp wide tap target", bounds.width >= 48 * density)
            assertTrue("$value must have 48dp high tap target", bounds.height >= 48 * density)
            node.performClick()
        }
        composeRule.runOnIdle {
            assertEquals(labels.map { it.first }, selected)
        }
    }

    @Test
    fun fiveMoodChoicesWrapOnSmallScreensInsteadOfClipping() {
        composeRule.setContent {
            MaterialTheme {
                Box(Modifier.width(240.dp)) {
                    MoodSelectionOptions {}
                }
            }
        }
        val first = composeRule.onNodeWithTag("mood-option-great").fetchSemanticsNode().boundsInRoot
        val last = composeRule.onNodeWithTag("mood-option-stressed").fetchSemanticsNode().boundsInRoot
        assertTrue("fifth mood should wrap to a new row on a 240dp card", last.top >= first.bottom)
    }
}
