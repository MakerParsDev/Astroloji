package com.parsfilo.astrology.feature.settings

import android.content.Context
import android.content.Intent
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.R
import com.parsfilo.astrology.ui.theme.AstrolojiTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class SettingsExternalLinksTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun privacyAndContactIntentsUseCanonicalDestinations() {
        val privacy = privacyPolicyIntent()
        assertThat(privacy.action).isEqualTo(Intent.ACTION_VIEW)
        assertThat(privacy.data.toString()).isEqualTo("https://astrology.parsfilo.com/privacy")

        val contact = supportContactIntent()
        assertThat(contact.action).isEqualTo(Intent.ACTION_SENDTO)
        assertThat(contact.data.toString()).isEqualTo("mailto:info@parsfilo.com")
    }

    @Test
    fun quickAccessLinksAreDistinctOneTapButtons() {
        var privacyClicks = 0
        var dataClicks = 0
        composeRule.setContent {
            AstrolojiTheme(darkTheme = true) {
                SettingsQuickAccessRow(
                    privacyLabel = "Privacy Policy",
                    accountLabel = "Account and data",
                    onPrivacyClick = { privacyClicks++ },
                    onAccountClick = { dataClicks++ },
                )
            }
        }

        val isButton = SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button)
        composeRule.onNode(hasText("Privacy Policy") and isButton).performClick()
        composeRule.onNode(hasText("Account and data") and isButton).performClick()

        assertThat(privacyClicks).isEqualTo(1)
        assertThat(dataClicks).isEqualTo(1)
    }

    @Test
    fun completedServerDeletionHidesDestructiveButtonAndAllowsAcknowledgement() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val confirm = context.getString(R.string.settings_delete_dialog_confirm)
        val close = context.getString(R.string.settings_delete_dialog_close)
        val deletedTitle = context.getString(R.string.settings_delete_local_cleanup_title)
        val events = mutableListOf<SettingsUiEvent>()
        val message = "Account deleted online; clear local app storage."

        composeRule.setContent {
            AstrolojiTheme(darkTheme = true) {
                SettingsAccountDeletionDialog(
                    uiState =
                        SettingsUiState(
                            showDeleteConfirmation = true,
                            accountDeletedOnServer = true,
                            error = message,
                        ),
                    onEvent = events::add,
                )
            }
        }

        composeRule.onNodeWithText(message).assertExists()
        composeRule.onNodeWithText(deletedTitle).assertExists()
        composeRule.onNodeWithText(confirm).assertDoesNotExist()
        composeRule.onNodeWithText(close).performClick()
        assertThat(events).containsExactly(SettingsUiEvent.DismissAccountDeletion)
    }

    @Test
    fun externalLinkRowExposesButtonSemanticsAndInvokesClick() {
        var clicks = 0
        composeRule.setContent {
            AstrolojiTheme(darkTheme = true) {
                SettingsExternalLinkRow(label = "Privacy Policy", onClick = { clicks++ })
            }
        }

        val linkMatcher =
            hasText("Privacy Policy") and
                SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button)
        composeRule.onNode(linkMatcher).performClick()
        assertThat(clicks).isEqualTo(1)
    }
}
