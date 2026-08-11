@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.store

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.ui.theme.AstrolojiTheme

private const val PHONE_PREVIEW = "spec:width=360dp,height=800dp,dpi=480"

@Composable
private fun StoreMarketingFrame(
    headline: String,
    supportingText: String,
    @DrawableRes captureRes: Int,
    cropAlignment: Alignment,
) {
    AstrolojiTheme(darkTheme = true) {
        CosmicBackground(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier.fillMaxSize().padding(horizontal = 18.dp, vertical = 22.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = headline,
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color.White,
                )
                Text(
                    text = supportingText,
                    style = MaterialTheme.typography.bodyLarge,
                    color = Color.White.copy(alpha = 0.84f),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Image(
                    painter = painterResource(captureRes),
                    contentDescription = null,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(560.dp)
                            .clip(RoundedCornerShape(28.dp)),
                    alignment = cropAlignment,
                    contentScale = ContentScale.Crop,
                )
            }
        }
    }
}

@Composable
private fun StoreCaptureScene(
    copy: StoreMarketingCopy,
    @DrawableRes captureRes: Int,
    cropAlignment: Alignment = Alignment.TopCenter,
) = StoreMarketingFrame(
    headline = copy.headline,
    supportingText = copy.supportingText,
    captureRes = captureRes,
    cropAlignment = cropAlignment,
)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "en", showBackground = true)
@Composable
fun StoreDailyEnglishScreenshot() = StoreCaptureScene(englishStoreCopy.daily, R.drawable.store_capture_en_daily)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "tr-rTR", showBackground = true)
@Composable
fun StoreDailyTurkishScreenshot() = StoreCaptureScene(turkishStoreCopy.daily, R.drawable.store_capture_tr_daily)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "es-rES", showBackground = true)
@Composable
fun StoreDailySpanishScreenshot() = StoreCaptureScene(spanishStoreCopy.daily, R.drawable.store_capture_es_daily)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "pt-rBR", showBackground = true)
@Composable
fun StoreDailyPortugueseScreenshot() = StoreCaptureScene(portugueseStoreCopy.daily, R.drawable.store_capture_pt_daily)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "en", showBackground = true)
@Composable
fun StoreGuidanceEnglishScreenshot() = StoreCaptureScene(englishStoreCopy.weekly, R.drawable.store_capture_en_weekly)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "tr-rTR", showBackground = true)
@Composable
fun StoreGuidanceTurkishScreenshot() = StoreCaptureScene(turkishStoreCopy.weekly, R.drawable.store_capture_tr_weekly)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "es-rES", showBackground = true)
@Composable
fun StoreGuidanceSpanishScreenshot() = StoreCaptureScene(spanishStoreCopy.weekly, R.drawable.store_capture_es_weekly)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "pt-rBR", showBackground = true)
@Composable
fun StoreGuidancePortugueseScreenshot() = StoreCaptureScene(portugueseStoreCopy.weekly, R.drawable.store_capture_pt_weekly)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "en", showBackground = true)
@Composable
fun StoreToolsEnglishScreenshot() = StoreCaptureScene(englishStoreCopy.monthly, R.drawable.store_capture_en_monthly)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "tr-rTR", showBackground = true)
@Composable
fun StoreToolsTurkishScreenshot() = StoreCaptureScene(turkishStoreCopy.monthly, R.drawable.store_capture_tr_monthly)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "es-rES", showBackground = true)
@Composable
fun StoreToolsSpanishScreenshot() = StoreCaptureScene(spanishStoreCopy.monthly, R.drawable.store_capture_es_monthly)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "pt-rBR", showBackground = true)
@Composable
fun StoreToolsPortugueseScreenshot() = StoreCaptureScene(portugueseStoreCopy.monthly, R.drawable.store_capture_pt_monthly)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "en", showBackground = true)
@Composable
fun StoreCompatibilityEnglishScreenshot() = StoreCaptureScene(englishStoreCopy.compatibility, R.drawable.store_capture_en_compatibility)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "tr-rTR", showBackground = true)
@Composable
fun StoreCompatibilityTurkishScreenshot() = StoreCaptureScene(turkishStoreCopy.compatibility, R.drawable.store_capture_tr_compatibility)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "es-rES", showBackground = true)
@Composable
fun StoreCompatibilitySpanishScreenshot() = StoreCaptureScene(spanishStoreCopy.compatibility, R.drawable.store_capture_es_compatibility)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "pt-rBR", showBackground = true)
@Composable
fun StoreCompatibilityPortugueseScreenshot() = StoreCaptureScene(portugueseStoreCopy.compatibility, R.drawable.store_capture_pt_compatibility)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "en", showBackground = true)
@Composable
fun StorePersonalityEnglishScreenshot() = StoreCaptureScene(englishStoreCopy.profile, R.drawable.store_capture_en_profile)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "tr-rTR", showBackground = true)
@Composable
fun StorePersonalityTurkishScreenshot() = StoreCaptureScene(turkishStoreCopy.profile, R.drawable.store_capture_tr_profile)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "es-rES", showBackground = true)
@Composable
fun StorePersonalitySpanishScreenshot() = StoreCaptureScene(spanishStoreCopy.profile, R.drawable.store_capture_es_profile)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "pt-rBR", showBackground = true)
@Composable
fun StorePersonalityPortugueseScreenshot() = StoreCaptureScene(portugueseStoreCopy.profile, R.drawable.store_capture_pt_profile)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "en", showBackground = true)
@Composable
fun StorePremiumEnglishScreenshot() = StoreCaptureScene(englishStoreCopy.premium, R.drawable.store_capture_en_premium)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "tr-rTR", showBackground = true)
@Composable
fun StorePremiumTurkishScreenshot() = StoreCaptureScene(turkishStoreCopy.premium, R.drawable.store_capture_tr_premium)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "es-rES", showBackground = true)
@Composable
fun StorePremiumSpanishScreenshot() = StoreCaptureScene(spanishStoreCopy.premium, R.drawable.store_capture_es_premium)

@PreviewTest
@Preview(device = PHONE_PREVIEW, locale = "pt-rBR", showBackground = true)
@Composable
fun StorePremiumPortugueseScreenshot() = StoreCaptureScene(portugueseStoreCopy.premium, R.drawable.store_capture_pt_premium)
