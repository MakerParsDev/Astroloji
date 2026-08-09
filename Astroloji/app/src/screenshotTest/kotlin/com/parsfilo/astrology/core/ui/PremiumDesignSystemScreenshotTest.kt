@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.core.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import com.parsfilo.astrology.core.ui.components.PremiumGlassCard
import com.parsfilo.astrology.core.ui.components.PremiumGoldButton
import com.parsfilo.astrology.core.ui.components.PremiumHeroCard
import com.parsfilo.astrology.core.ui.components.PremiumIconTile
import com.parsfilo.astrology.core.ui.components.PremiumMetricRing
import com.parsfilo.astrology.core.ui.components.PremiumPill
import com.parsfilo.astrology.core.ui.components.PremiumSectionHeader
import com.parsfilo.astrology.ui.theme.AstrolojiTheme

@Composable
private fun PremiumDesignSystemGolden(darkTheme: Boolean) {
    AstrolojiTheme(darkTheme = darkTheme) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
                    .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            PremiumSectionHeader(
                eyebrow = "ASTROLOJİ",
                title = "Evren bugün seninle",
                supportingText = "Kişisel gökyüzü rehberin",
            )
            PremiumHeroCard(
                symbol = "♈",
                eyebrow = "KOÇ",
                title = "Cesaretin yönünü belirlesin",
                subtitle = "21 Mart – 19 Nisan",
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                PremiumMetricRing(
                    value = 88,
                    label = "Enerji",
                )
                PremiumIconTile(
                    icon = Icons.Rounded.AutoAwesome,
                    label = "Günlük",
                    onClick = {},
                )
            }
            PremiumGlassCard {
                PremiumSectionHeader(
                    title = "Günün mesajı",
                    supportingText = "Netlik, sakinlik ve doğru zamanlama öne çıkıyor.",
                )
                PremiumPill(text = "Şanslı sayı · 7")
            }
            PremiumGoldButton(
                text = "Detaylı yorumu aç",
                onClick = {},
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@PreviewTest
@Preview(
    name = "Premium design system Turkish",
    widthDp = 360,
    heightDp = 800,
    locale = "tr-rTR",
    showBackground = true,
)
@Composable
fun PremiumDesignSystemTurkishScreenshot() {
    PremiumDesignSystemGolden(darkTheme = true)
}

@PreviewTest
@Preview(
    name = "Premium design system light Turkish",
    widthDp = 360,
    heightDp = 800,
    locale = "tr-rTR",
    showBackground = true,
)
@Composable
fun PremiumDesignSystemLightTurkishScreenshot() {
    PremiumDesignSystemGolden(darkTheme = false)
}
