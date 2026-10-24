package com.parsfilo.astrology.core.ui.components

import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.parsfilo.astrology.core.util.ZodiacSign
import com.parsfilo.astrology.ui.theme.AstrolojiTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Reference captures used to review #121's licensed vector set against device emoji. */
@RunWith(AndroidJUnit4::class)
class ZodiacIconVisualAcceptanceTest {
    @get:Rule val rule = createComposeRule()

    @Test fun vectorsDarkAt320dp200Percent() = capture("vectors-dark", vector = true, dark = true)

    @Test fun vectorsLightAt320dp200Percent() = capture("vectors-light", vector = true, dark = false)

    @Test fun legacyEmojiDarkForComparison() = capture("legacy-dark", vector = false, dark = true)

    private fun capture(
        name: String,
        vector: Boolean,
        dark: Boolean,
    ) {
        assertEquals(
            12,
            ZodiacSign.entries
                .map { it.iconRes }
                .distinct()
                .size,
        )
        rule.setContent {
            CompositionLocalProvider(LocalDensity provides Density(density = 1f, fontScale = 2f)) {
                AstrolojiTheme(darkTheme = dark) {
                    Column(
                        modifier = Modifier.width(320.dp).background(MaterialTheme.colorScheme.background).padding(4.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        ZodiacSign.entries.chunked(3).forEach { row ->
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                row.forEach { sign ->
                                    Column(
                                        modifier = Modifier.weight(1f).padding(2.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                    ) {
                                        Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
                                            if (vector) {
                                                ZodiacIcon(sign = sign, modifier = Modifier.size(44.dp))
                                            } else {
                                                Text(sign.symbol, style = MaterialTheme.typography.headlineLarge)
                                            }
                                        }
                                        Text(
                                            sign.localizedName("tr"),
                                            style = MaterialTheme.typography.labelSmall,
                                            textAlign = TextAlign.Center,
                                            color = MaterialTheme.colorScheme.onBackground,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        ZodiacSign.entries.forEach { rule.onNodeWithText(it.localizedName("tr")).assertExists() }
        val screenshot = rule.onRoot().captureToImage().asAndroidBitmap()
        val colors = mutableSetOf<Int>()
        for (y in 0 until screenshot.height step 20) {
            for (x in 0 until screenshot.width step 20) colors.add(screenshot.getPixel(x, y))
        }
        assertTrue("Blank zodiac screenshot", colors.size > 8)
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val dir = java.io.File(instrumentation.targetContext.getExternalFilesDir(null), "zodiac-qa")
        assertTrue(dir.mkdirs() || dir.isDirectory)
        java.io.File(dir, "$name.png").outputStream().use {
            assertTrue(screenshot.compress(Bitmap.CompressFormat.PNG, 100, it))
        }
        screenshot.recycle()
    }
}
