package com.parsfilo.astrology.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme =
    darkColorScheme(
        primary = DarkPrimary,
        secondary = DarkSecondary,
        tertiary = DarkAccent,
        background = DarkBackground,
        surface = DarkSurface,
        surfaceVariant = DarkSurfaceVariant,
        onPrimary = DarkBackground,
        onSecondary = DarkBackground,
        onBackground =
            androidx.compose.ui.graphics
                .Color(0xFFF6F1FF),
        onSurface =
            androidx.compose.ui.graphics
                .Color(0xFFF6F1FF),
        onSurfaceVariant =
            androidx.compose.ui.graphics
                .Color(0xFFC8C1E1),
        outline =
            androidx.compose.ui.graphics
                .Color(0xFF4D4665),
        outlineVariant =
            androidx.compose.ui.graphics
                .Color(0xFF2B2640),
    )

private val LightColorScheme =
    lightColorScheme(
        primary = LightPrimary,
        secondary = LightSecondary,
        tertiary = LightAccent,
        background = LightBackground,
        surface = LightSurface,
        surfaceVariant =
            androidx.compose.ui.graphics
                .Color(0xFFEAE3F8),
        onPrimary = androidx.compose.ui.graphics.Color.White,
        onSecondary = androidx.compose.ui.graphics.Color.White,
        onBackground =
            androidx.compose.ui.graphics
                .Color(0xFF201A2E),
        onSurface =
            androidx.compose.ui.graphics
                .Color(0xFF201A2E),
        onSurfaceVariant =
            androidx.compose.ui.graphics
                .Color(0xFF554E68),
        outline =
            androidx.compose.ui.graphics
                .Color(0xFFB9B0CC),
        outlineVariant =
            androidx.compose.ui.graphics
                .Color(0xFFD7CFE7),
    )

@Composable
fun AstrolojiTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content,
    )
}
