package com.parsfilo.astrology.feature.settings

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class PrivacyOptionsButtonTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun singleFlightDisablesButtonUntilPrivacyFormCompletes() {
        val result = CompletableDeferred<Boolean>()
        var calls = 0
        var failures = 0
        composeRule.setContent {
            MaterialTheme {
                PrivacyOptionsButton(
                    onShowForm = {
                        calls++
                        result.await()
                    },
                    onFormError = { failures++ },
                )
            }
        }
        val button = composeRule.onNodeWithTag("manage-ad-privacy")
        button.assertIsEnabled()
        button.performClick()
        composeRule.waitForIdle()
        button.assertIsNotEnabled()
        composeRule.runOnIdle { assertEquals(1, calls) }
        result.complete(true)
        composeRule.waitForIdle()
        button.assertIsEnabled()
        composeRule.runOnIdle {
            assertEquals(1, calls)
            assertEquals(0, failures)
        }
    }

    @Test
    fun thrownPrivacyFormFailureReportsErrorAndReenablesRetry() {
        var calls = 0
        var failures = 0
        composeRule.setContent {
            MaterialTheme {
                PrivacyOptionsButton(
                    onShowForm = {
                        calls++
                        error("synthetic consent UI failure")
                    },
                    onFormError = { failures++ },
                )
            }
        }
        val button = composeRule.onNodeWithTag("manage-ad-privacy")
        button.performClick()
        composeRule.waitForIdle()
        button.assertIsEnabled()
        composeRule.runOnIdle {
            assertEquals(1, calls)
            assertEquals(1, failures)
        }
        button.performClick()
        composeRule.waitForIdle()
        composeRule.runOnIdle {
            assertEquals(2, calls)
            assertEquals(2, failures)
        }
    }

    @Test
    fun privacyFormFailureReportsErrorAndReenablesRetry() {
        var calls = 0
        var failures = 0
        composeRule.setContent {
            MaterialTheme {
                PrivacyOptionsButton(
                    onShowForm = {
                        calls++
                        false
                    },
                    onFormError = { failures++ },
                )
            }
        }
        val button = composeRule.onNodeWithTag("manage-ad-privacy")
        button.performClick()
        composeRule.waitForIdle()
        button.assertIsEnabled()
        composeRule.runOnIdle {
            assertEquals(1, calls)
            assertEquals(1, failures)
        }
        button.performClick()
        composeRule.waitForIdle()
        composeRule.runOnIdle {
            assertEquals(2, calls)
            assertEquals(2, failures)
        }
    }
}
