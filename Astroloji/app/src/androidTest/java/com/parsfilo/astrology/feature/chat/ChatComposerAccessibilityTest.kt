package com.parsfilo.astrology.feature.chat

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasImeAction
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.text.input.ImeAction
import androidx.test.platform.app.InstrumentationRegistry
import com.parsfilo.astrology.R
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class ChatComposerAccessibilityTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun keyboardSendSubmitsNonBlankDraftOnlyOnce() {
        val sent = mutableListOf<String>()
        composeRule.setContent {
            var draft by remember { mutableStateOf("") }
            MaterialTheme {
                ChatInputBar(
                    input = draft,
                    isSending = false,
                    onInputChanged = { draft = it },
                    onSend = { sent.add(draft) },
                )
            }
        }
        val input = composeRule.onNodeWithTag("chat-input")
        input.assert(hasImeAction(ImeAction.Send))
        input.performTextInput("What does this transit mean?")
        input.performImeAction()
        composeRule.runOnIdle { assertEquals(listOf("What does this transit mean?"), sent) }
    }

    @Test
    fun blankDraftCannotBeSentFromKeyboardOrSendButton() {
        var sends = 0
        composeRule.setContent {
            MaterialTheme {
                ChatInputBar(
                    input = "   ",
                    isSending = false,
                    onInputChanged = {},
                    onSend = { sends++ },
                )
            }
        }
        composeRule.onNodeWithTag("chat-input").performImeAction()
        val label = InstrumentationRegistry.getInstrumentation().targetContext.getString(R.string.chat_send_cta)
        composeRule.onNodeWithContentDescription(label).assertIsNotEnabled()
        composeRule.runOnIdle { assertEquals(0, sends) }
    }

    @Test
    fun inputDisabledWhileAnswerIsPending() {
        var sends = 0
        composeRule.setContent {
            MaterialTheme {
                ChatInputBar(
                    input = "pending",
                    isSending = true,
                    onInputChanged = {},
                    onSend = { sends++ },
                )
            }
        }
        composeRule.onNodeWithTag("chat-input").assertIsNotEnabled()
        composeRule.runOnIdle { assertEquals(0, sends) }
    }
}
