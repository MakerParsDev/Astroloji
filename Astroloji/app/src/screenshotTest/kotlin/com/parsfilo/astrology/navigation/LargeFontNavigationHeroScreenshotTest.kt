@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import com.parsfilo.astrology.core.ui.components.PremiumHeroCard
import com.parsfilo.astrology.ui.theme.AstrolojiTheme

@PreviewTest
@Preview(
    name = "Large font hero and four navigation tabs",
    widthDp = 320,
    heightDp = 700,
    fontScale = 2f,
    showBackground = true,
)
@Composable
fun LargeFontNavigationHeroScreenshot() {
    AstrolojiTheme(darkTheme = false) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background),
        ) {
            Column(Modifier.padding(16.dp)) {
                PremiumHeroCard(
                    symbol = "♎",
                    eyebrow = "Libra",
                    title = "Today's Horoscope",
                    subtitle = "Sep 23 - Oct 22",
                )
            }
            Spacer(Modifier.weight(1f))
            PremiumNavigationBar(
                items =
                    listOf(
                        PremiumNavigationItem("Home", Icons.Outlined.Home, selected = true, onClick = {}),
                        PremiumNavigationItem("Compatibility", Icons.Outlined.AutoAwesome, selected = false, onClick = {}),
                        PremiumNavigationItem("Profile", Icons.Outlined.Person, selected = false, onClick = {}),
                        PremiumNavigationItem("Premium", Icons.Outlined.Star, selected = false, onClick = {}),
                    ),
            )
        }
    }
}
