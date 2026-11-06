package com.parsfilo.astrology.feature.settings

import android.content.Intent
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
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
