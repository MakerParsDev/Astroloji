@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.store

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import com.parsfilo.astrology.R
import com.parsfilo.astrology.ui.theme.AstrolojiTheme

@Composable
private fun StoreFeatureGraphic(
    headline: String,
    supportingText: String,
) {
    AstrolojiTheme(darkTheme = true) {
        Box(
            modifier =
                Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
                    .background(
                        Brush.horizontalGradient(
                            listOf(
                                MaterialTheme.colorScheme.background,
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.32f),
                                MaterialTheme.colorScheme.secondary.copy(alpha = 0.24f),
                            ),
                        ),
                    ),
        ) {
            Text(
                text = "✦",
                modifier = Modifier.align(Alignment.TopEnd).padding(top = 34.dp, end = 58.dp),
                style = MaterialTheme.typography.displayLarge,
                color = MaterialTheme.colorScheme.secondary.copy(alpha = 0.48f),
            )
            Text(
                text = "♈  ♌  ♐",
                modifier = Modifier.align(Alignment.BottomEnd).padding(end = 52.dp, bottom = 36.dp),
                style = MaterialTheme.typography.headlineLarge,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.34f),
            )
            Row(
                modifier = Modifier.fillMaxSize().padding(horizontal = 68.dp, vertical = 52.dp),
                horizontalArrangement = Arrangement.spacedBy(46.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    modifier = Modifier.size(210.dp),
                    shape = RoundedCornerShape(52.dp),
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.82f),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Image(
                            painter = painterResource(R.mipmap.ic_launcher_foreground),
                            contentDescription = null,
                            modifier = Modifier.size(190.dp),
                            contentScale = ContentScale.Fit,
                        )
                    }
                }
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Text(
                        text = "ASTROLOJİ",
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = headline,
                        style = MaterialTheme.typography.displayLarge,
                        color = MaterialTheme.colorScheme.onBackground,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = supportingText,
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun StoreAppIcon() {
    AstrolojiTheme(darkTheme = true) {
        Box(
            modifier =
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.radialGradient(
                            listOf(
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.92f),
                                MaterialTheme.colorScheme.background,
                            ),
                        ),
                    ),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier =
                    Modifier
                        .size(430.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.44f)),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    painter = painterResource(R.mipmap.ic_launcher_foreground),
                    contentDescription = null,
                    modifier = Modifier.size(410.dp),
                    contentScale = ContentScale.Fit,
                )
            }
        }
    }
}

@PreviewTest
@Preview(
    name = "Store feature graphic English",
    device = "spec:width=1024dp,height=500dp,dpi=160",
    locale = "en",
    showBackground = true,
)
@Composable
fun StoreFeatureGraphicEnglishScreenshot() {
    StoreFeatureGraphic(
        headline = "Your daily horoscope, beautifully organized",
        supportingText = "Daily guidance · Compatibility · Weekly and monthly insights",
    )
}

@PreviewTest
@Preview(
    name = "Store feature graphic Turkish",
    device = "spec:width=1024dp,height=500dp,dpi=160",
    locale = "tr-rTR",
    showBackground = true,
)
@Composable
fun StoreFeatureGraphicTurkishScreenshot() {
    StoreFeatureGraphic(
        headline = "Günlük burç yorumunuz, sade ve modern",
        supportingText = "Günlük rehber · Burç uyumu · Haftalık ve aylık bakış",
    )
}

@PreviewTest
@Preview(
    name = "Store feature graphic Spanish",
    device = "spec:width=1024dp,height=500dp,dpi=160",
    locale = "es-rES",
    showBackground = true,
)
@Composable
fun StoreFeatureGraphicSpanishScreenshot() {
    StoreFeatureGraphic(
        headline = "Tu horóscopo diario, bellamente organizado",
        supportingText = "Guía diaria · Compatibilidad · Perspectivas semanales y mensuales",
    )
}

@PreviewTest
@Preview(
    name = "Store feature graphic Portuguese",
    device = "spec:width=1024dp,height=500dp,dpi=160",
    locale = "pt-rBR",
    showBackground = true,
)
@Composable
fun StoreFeatureGraphicPortugueseScreenshot() {
    StoreFeatureGraphic(
        headline = "Seu horóscopo diário, lindamente organizado",
        supportingText = "Orientação diária · Compatibilidade · Perspectivas semanais e mensais",
    )
}

@PreviewTest
@Preview(
    name = "Store feature graphic German",
    device = "spec:width=1024dp,height=500dp,dpi=160",
    locale = "de-rDE",
    showBackground = true,
)
@Composable
fun StoreFeatureGraphicGermanScreenshot() {
    StoreFeatureGraphic(
        headline = "Ihr tägliches Horoskop, schön aufbereitet",
        supportingText = "Tägliche Orientierung · Kompatibilität · Wöchentliche und monatliche Einblicke",
    )
}

@PreviewTest
@Preview(
    name = "Store feature graphic French",
    device = "spec:width=1024dp,height=500dp,dpi=160",
    locale = "fr-rFR",
    showBackground = true,
)
@Composable
fun StoreFeatureGraphicFrenchScreenshot() {
    StoreFeatureGraphic(
        headline = "Votre horoscope quotidien, magnifiquement organisé",
        supportingText = "Guide quotidien · Compatibilité · Aperçus hebdomadaires et mensuels",
    )
}

@PreviewTest
@Preview(
    name = "Store app icon",
    device = "spec:width=512dp,height=512dp,dpi=160",
    showBackground = true,
)
@Composable
fun StoreAppIconScreenshot() {
    StoreAppIcon()
}
