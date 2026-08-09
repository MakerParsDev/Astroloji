@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.compatibility

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import com.parsfilo.astrology.core.domain.model.CompatibilityReport
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.util.ZodiacSign
import com.parsfilo.astrology.ui.theme.AstrolojiTheme

private val compatibilityGolden =
    CompatibilityReport(
        sign1 = "aries",
        sign2 = "libra",
        language = "tr",
        overallScore = 87,
        loveScore = 91,
        friendshipScore = 82,
        workScore = 78,
        summary = "Enerji ve denge birbirini tamamlıyor.",
        strengths = listOf("Açık iletişim"),
        challenges = listOf("Sabır"),
        advice = "Birbirinizin ritmine alan açın.",
        famousCouples = emptyList(),
    )

@PreviewTest
@Preview(
    name = "Premium compatibility Turkish",
    widthDp = 360,
    heightDp = 600,
    locale = "tr-rTR",
    showBackground = true,
)
@Composable
fun CompatibilityPremiumTurkishScreenshot() {
    AstrolojiTheme(darkTheme = true) {
        CosmicBackground(modifier = Modifier.fillMaxSize()) {
            CompatibilityPremiumSummary(
                mySign = ZodiacSign.ARIES,
                selectedSign = ZodiacSign.LIBRA,
                report = compatibilityGolden,
                language = "tr",
                modifier = Modifier.padding(16.dp),
            )
        }
    }
}
