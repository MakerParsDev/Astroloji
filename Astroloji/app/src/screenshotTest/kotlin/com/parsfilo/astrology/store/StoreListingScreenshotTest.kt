@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.store

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import com.parsfilo.astrology.core.ui.components.AstroSectionTitle
import com.parsfilo.astrology.core.ui.components.AstrologyCard
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.feature.premium.PremiumOfferCard
import com.parsfilo.astrology.ui.theme.AstrolojiTheme

private const val MONTHLY_PRODUCT = "premium_monthly"
private const val WEEKLY_PRODUCT = "premium_weekly"

@Composable
private fun StoreSceneFrame(
    headline: String,
    supportingText: String,
    content: @Composable () -> Unit,
) {
    AstrolojiTheme(darkTheme = true) {
        CosmicBackground(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier.fillMaxSize().padding(horizontal = 18.dp, vertical = 20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Text(
                    text = headline,
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = supportingText,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                content()
            }
        }
    }
}

@Composable
private fun InsightMeter(
    label: String,
    value: Float,
) {
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, style = MaterialTheme.typography.labelLarge)
            Text("${(value * 100).toInt()}%", style = MaterialTheme.typography.labelLarge)
        }
        LinearProgressIndicator(
            progress = { value },
            modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(999.dp)),
        )
    }
}

@Composable
private fun StoreDailyScene(copy: StoreLocalizedCopy) {
    StoreSceneFrame(copy.dailyHeadline, copy.dailyBody) {
        AstroSectionTitle(title = "Aries", eyebrow = "Today")
        AstrologyCard {
            Text("A confident start", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            InsightMeter("Energy", 0.88f)
            InsightMeter("Love", 0.76f)
            InsightMeter("Work", 0.82f)
            Text(
                "Take one clear step toward the conversation or project that matters most today.",
                style = MaterialTheme.typography.bodyLarge,
            )
        }
    }
}

@Composable
private fun StoreGuidanceScene(copy: StoreLocalizedCopy) {
    StoreSceneFrame(copy.guidanceHeadline, "") {
        AstrologyCard {
            Text(copy.weeklyTitle, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(copy.weeklyBody)
            Text("Best day · Thursday", color = MaterialTheme.colorScheme.secondary)
        }
        AstrologyCard {
            Text(copy.monthlyTitle, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(copy.monthlyBody)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("Love", "Work", "Growth").forEach { label ->
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
                    ) {
                        Text(label, modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun StoreCompatibilityScene(copy: StoreLocalizedCopy) {
    StoreSceneFrame(copy.compatibilityHeadline, copy.compatibilityBody) {
        AstrologyCard {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("♈", style = MaterialTheme.typography.displayLarge)
                Text("86%", style = MaterialTheme.typography.displayLarge, color = MaterialTheme.colorScheme.secondary)
                Text("♌", style = MaterialTheme.typography.displayLarge)
            }
            Text("Aries + Leo", modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            InsightMeter("Love", 0.91f)
            InsightMeter("Friendship", 0.84f)
            InsightMeter("Work", 0.79f)
        }
    }
}

@Composable
private fun StorePersonalityScene(copy: StoreLocalizedCopy) {
    StoreSceneFrame(copy.personalityHeadline, copy.personalityBody) {
        AstroSectionTitle(title = "Aries", eyebrow = "Fire · Mars")
        AstrologyCard {
            Text(copy.strengthsTitle, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            copy.strengths.forEach { strength -> Text("• $strength") }
        }
        AstrologyCard {
            Text("Deeper insight", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text("Channel your momentum into one meaningful direction and make space for collaboration.")
        }
    }
}

@Composable
private fun ToolRow(
    symbol: String,
    title: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.secondary.copy(alpha = 0.18f),
        ) {
            Text(symbol, modifier = Modifier.padding(12.dp), style = MaterialTheme.typography.titleLarge)
        }
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun StoreToolsScene(copy: StoreLocalizedCopy) {
    StoreSceneFrame(copy.toolsHeadline, copy.toolsBody) {
        AstrologyCard {
            ToolRow("◫", copy.widgetLabel)
            ToolRow("✦", copy.notificationLabel)
            ToolRow("↗", copy.shareLabel)
        }
        Box(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(210.dp)
                    .background(
                        Brush.verticalGradient(
                            listOf(
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.22f),
                                MaterialTheme.colorScheme.surface.copy(alpha = 0.72f),
                            ),
                        ),
                        RoundedCornerShape(24.dp),
                    ),
            contentAlignment = Alignment.Center,
        ) {
            Text("♈  Today · 88%", style = MaterialTheme.typography.headlineMedium)
        }
    }
}

@Composable
private fun StorePremiumScene(
    copy: StoreLocalizedCopy,
    locale: StoreLocale,
) {
    val plans = storePremiumPlans(locale)
    check(plans.map { it.productId } == listOf(MONTHLY_PRODUCT, WEEKLY_PRODUCT))
    StoreSceneFrame(copy.premiumHeadline, copy.premiumBody) {
        Box(modifier = Modifier.fillMaxWidth().height(320.dp).clip(RoundedCornerShape(24.dp))) {
            Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                PremiumOfferCard(
                    uiState = storePremiumState(plans),
                    plans = plans,
                    selected = plans.first(),
                    purchaseReady = true,
                    callbacks = storePremiumCallbacks,
                )
                Spacer(modifier = Modifier.height(8.dp))
            }
        }
    }
}

@PreviewTest
@Preview(device = "spec:width=360dp,height=640dp,dpi=480", locale = "en", showBackground = true)
@Composable
fun StoreDailyEnglishScreenshot() = StoreDailyScene(englishStoreCopy)

@PreviewTest
@Preview(device = "spec:width=360dp,height=640dp,dpi=480", locale = "tr-rTR", showBackground = true)
@Composable
fun StoreDailyTurkishScreenshot() = StoreDailyScene(turkishStoreCopy)

@PreviewTest
@Preview(device = "spec:width=360dp,height=640dp,dpi=480", locale = "en", showBackground = true)
@Composable
fun StoreGuidanceEnglishScreenshot() = StoreGuidanceScene(englishStoreCopy)

@PreviewTest
@Preview(device = "spec:width=360dp,height=640dp,dpi=480", locale = "tr-rTR", showBackground = true)
@Composable
fun StoreGuidanceTurkishScreenshot() = StoreGuidanceScene(turkishStoreCopy)

@PreviewTest
@Preview(device = "spec:width=360dp,height=640dp,dpi=480", locale = "en", showBackground = true)
@Composable
fun StoreCompatibilityEnglishScreenshot() = StoreCompatibilityScene(englishStoreCopy)

@PreviewTest
@Preview(device = "spec:width=360dp,height=640dp,dpi=480", locale = "tr-rTR", showBackground = true)
@Composable
fun StoreCompatibilityTurkishScreenshot() = StoreCompatibilityScene(turkishStoreCopy)

@PreviewTest
@Preview(device = "spec:width=360dp,height=640dp,dpi=480", locale = "en", showBackground = true)
@Composable
fun StorePersonalityEnglishScreenshot() = StorePersonalityScene(englishStoreCopy)

@PreviewTest
@Preview(device = "spec:width=360dp,height=640dp,dpi=480", locale = "tr-rTR", showBackground = true)
@Composable
fun StorePersonalityTurkishScreenshot() = StorePersonalityScene(turkishStoreCopy)

@PreviewTest
@Preview(device = "spec:width=360dp,height=640dp,dpi=480", locale = "en", showBackground = true)
@Composable
fun StoreToolsEnglishScreenshot() = StoreToolsScene(englishStoreCopy)

@PreviewTest
@Preview(device = "spec:width=360dp,height=640dp,dpi=480", locale = "tr-rTR", showBackground = true)
@Composable
fun StoreToolsTurkishScreenshot() = StoreToolsScene(turkishStoreCopy)

@PreviewTest
@Preview(device = "spec:width=360dp,height=640dp,dpi=480", locale = "en", showBackground = true)
@Composable
fun StorePremiumEnglishScreenshot() = StorePremiumScene(englishStoreCopy, StoreLocale.ENGLISH)

@PreviewTest
@Preview(device = "spec:width=360dp,height=640dp,dpi=480", locale = "tr-rTR", showBackground = true)
@Composable
fun StorePremiumTurkishScreenshot() = StorePremiumScene(turkishStoreCopy, StoreLocale.TURKISH)
