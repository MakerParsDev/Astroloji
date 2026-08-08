@file:Suppress("MagicNumber")

package com.parsfilo.astrology.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme =
    darkColorScheme(
        primary = WarmGold,
        onPrimary = Midnight900,
        primaryContainer = Color(0xFF332A1D),
        onPrimaryContainer = SoftGold,
        secondary = CosmicViolet,
        onSecondary = Midnight900,
        secondaryContainer = Color(0xFF2B2148),
        onSecondaryContainer = Color(0xFFE8DFFF),
        tertiary = CelestialBlue,
        onTertiary = Midnight900,
        background = Midnight900,
        onBackground = Starlight,
        surface = Midnight800,
        onSurface = Starlight,
        surfaceVariant = Midnight700,
        onSurfaceVariant = MoonMist,
        outline = Color(0xFF655B7D),
        outlineVariant = Color(0xFF302A49),
    )
private val LightColorScheme =
    lightColorScheme(
        primary = LightPrimary,
        onPrimary = Color.White,
        primaryContainer = Color(0xFFE9DDF9),
        onPrimaryContainer = Color(0xFF24133D),
        secondary = LightSecondary,
        onSecondary = Color.White,
        secondaryContainer = Color(0xFFFFE6B7),
        onSecondaryContainer = Color(0xFF352306),
        tertiary = LightAccent,
        onTertiary = Color.White,
        background = LightBackground,
        onBackground = Color(0xFF211D2A),
        surface = LightSurface,
        onSurface = Color(0xFF211D2A),
        surfaceVariant = Color(0xFFECE5F2),
        onSurfaceVariant = Color(0xFF5C5665),
        outline = Color(0xFFA8A0B2),
        outlineVariant = Color(0xFFD8D0E0),
    )

@Composable
fun AstrolojiTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme,
        typography = Typography,
        content = content,
    )
}
