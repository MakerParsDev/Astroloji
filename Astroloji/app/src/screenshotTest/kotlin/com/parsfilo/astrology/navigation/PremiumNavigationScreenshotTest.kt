@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import com.android.tools.screenshot.PreviewTest
import com.parsfilo.astrology.ui.theme.AstrolojiTheme
import com.parsfilo.astrology.ui.theme.Midnight900

@Composable
private fun PremiumNavigationGolden() {
    AstrolojiTheme(darkTheme = true) {
        Box(
            modifier = Modifier.fillMaxSize().background(Midnight900),
            contentAlignment = Alignment.BottomCenter,
        ) {
            PremiumNavigationBar(
                items =
                    listOf(
                        PremiumNavigationItem("Ana Sayfa", Icons.Outlined.Home, selected = true, onClick = {}),
                        PremiumNavigationItem("Uyumluluk", Icons.Outlined.AutoAwesome, selected = false, onClick = {}),
                        PremiumNavigationItem("Profil", Icons.Outlined.Person, selected = false, onClick = {}),
                    ),
                modifier = Modifier.fillMaxWidth().wrapContentHeight(),
            )
        }
    }
}

@PreviewTest
@Preview(
    name = "Premium navigation Turkish",
    widthDp = 360,
    heightDp = 140,
    locale = "tr-rTR",
    showBackground = true,
)
@Composable
fun PremiumNavigationTurkishScreenshot() {
    PremiumNavigationGolden()
}
