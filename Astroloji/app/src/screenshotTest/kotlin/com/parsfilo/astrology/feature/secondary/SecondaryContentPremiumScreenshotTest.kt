@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.secondary

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.ui.components.PremiumGlassCard
import com.parsfilo.astrology.core.ui.components.PremiumHeroCard
import com.parsfilo.astrology.ui.theme.AstrolojiTheme

@PreviewTest
@Preview(
    name = "Premium weekly surface Turkish",
    widthDp = 360,
    heightDp = 560,
    locale = "tr-rTR",
    showBackground = true,
)
@Composable
fun SecondaryWeeklyPremiumScreenshot() {
    AstrolojiTheme(darkTheme = true) {
        CosmicBackground(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier.fillMaxSize().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                PremiumHeroCard(
                    symbol = "♈",
                    eyebrow = "KOÇ",
                    title = "Bu hafta",
                    subtitle = "10 Ağustos – 16 Ağustos",
                )
                PremiumGlassCard {
                    Text(
                        text = "Haftanın ana teması",
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Text(
                        text = "Enerjini tek bir hedefte topladığında ilerleme hızlanıyor.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                PremiumGlassCard {
                    Text(
                        text = "Aşk ve ilişkiler",
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Text(
                        text = "Net iletişim ve sakin tempo bu haftanın güçlü tarafı.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
