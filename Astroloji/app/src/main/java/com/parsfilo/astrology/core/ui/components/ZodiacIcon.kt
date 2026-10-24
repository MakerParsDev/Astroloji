package com.parsfilo.astrology.core.ui.components

import androidx.compose.foundation.Image
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.res.painterResource
import com.parsfilo.astrology.core.util.ZodiacSign

/** Bundled vector glyph: decorative because the adjacent localized sign name is announced. */
@Composable
fun ZodiacIcon(
    sign: ZodiacSign,
    modifier: Modifier = Modifier,
    tint: Color = MaterialTheme.colorScheme.primary,
) {
    Image(
        painter = painterResource(sign.iconRes),
        contentDescription = null,
        modifier = modifier,
        colorFilter = ColorFilter.tint(tint),
    )
}
