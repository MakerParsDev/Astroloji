@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.util.ZodiacSign
import com.parsfilo.astrology.ui.theme.AstrolojiTheme

@PreviewTest
@Preview(
    name = "Premium settings Turkish",
    widthDp = 360,
    heightDp = 520,
    locale = "tr-rTR",
    showBackground = true,
)
@Composable
fun SettingsPremiumTurkishScreenshot() {
    AstrolojiTheme(darkTheme = true) {
        CosmicBackground(modifier = Modifier.fillMaxSize()) {
            SettingsPremiumOverview(
                currentSign = ZodiacSign.ARIES,
                language = "tr",
                onChangeSign = {},
                modifier = Modifier.padding(16.dp),
            )
        }
    }
}

@PreviewTest
@Preview(
    name = "Privacy and data shortcuts Turkish",
    widthDp = 360,
    heightDp = 130,
    locale = "tr-rTR",
    showBackground = true,
)
@Composable
fun SettingsPrivacyDataShortcutsTurkishScreenshot() {
    AstrolojiTheme(darkTheme = true) {
        CosmicBackground(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.padding(16.dp)) {
                SettingsQuickAccessRow(
                    privacyLabel = stringResource(R.string.settings_privacy),
                    accountLabel = stringResource(R.string.settings_account_title),
                    onPrivacyClick = {},
                    onAccountClick = {},
                )
            }
        }
    }
}

@PreviewTest
@Preview(
    name = "Privacy and data shortcuts large German text",
    widthDp = 320,
    heightDp = 180,
    fontScale = 1.4f,
    locale = "de-rDE",
    showBackground = true,
)
@Composable
fun SettingsPrivacyDataShortcutsLargeFontScreenshot() {
    AstrolojiTheme(darkTheme = true) {
        CosmicBackground(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.padding(16.dp)) {
                SettingsQuickAccessRow(
                    privacyLabel = stringResource(R.string.settings_privacy),
                    accountLabel = stringResource(R.string.settings_account_title),
                    onPrivacyClick = {},
                    onAccountClick = {},
                )
            }
        }
    }
}
