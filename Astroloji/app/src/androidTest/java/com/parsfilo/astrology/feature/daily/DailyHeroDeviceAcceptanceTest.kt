package com.parsfilo.astrology.feature.daily

import android.graphics.Bitmap
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.parsfilo.astrology.core.domain.model.DailyHoroscope
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.util.ZodiacSign
import com.parsfilo.astrology.ui.theme.AstrolojiTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Isolated, account-free device acceptance for #122. Run at 320/360dp, 1x/2x system font. */
@RunWith(AndroidJUnit4::class)
class DailyHeroDeviceAcceptanceTest {
    @get:Rule val rule = createComposeRule()

    private val longSummary =
        "Boğa: Enerjini tek bir öncelikte toplamak bugün yolunu aydınlatabilir. " +
            "Birden çok sorumlulukla karşılaşırsan kendine zaman tanı ve küçük adımlarla ilerle."

    private val horoscope =
        DailyHoroscope(
            date = "2026-10-24",
            sign = "taurus",
            language = "tr",
            short = longSummary,
            full = null,
            love = null,
            career = null,
            money = null,
            health = null,
            dailyTip = null,
            luckyNumber = 7,
            luckyColor = "altın",
            energy = 85,
            loveScore = 75,
            careerScore = 72,
            moneyScore = 64,
            healthScore = 80,
        )

    @Composable
    private fun Fixture(dark: Boolean) {
        AstrolojiTheme(darkTheme = dark) {
            CosmicBackground(Modifier.fillMaxSize()) {
                Column(
                    modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
                ) {
                    DailyPremiumSummary(horoscope)
                }
            }
        }
    }

    private fun verify(
        width: Int,
        dark: Boolean,
    ) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val config = instrumentation.targetContext.resources.configuration
        assertTrue("Use a ${width}dp emulator window; actual ${config.screenWidthDp}dp", kotlin.math.abs(config.screenWidthDp - width) <= 3)
        assertTrue("Use 100% or 200% system font scale", kotlin.math.abs(config.fontScale - 1f) < 0.05f || kotlin.math.abs(config.fontScale - 2f) < 0.05f)

        rule.setContent { Fixture(dark) }
        rule.waitForIdle()
        val summary = rule.onNodeWithText(longSummary).assertExists()
        val title = rule.onNodeWithText("Boğa").assertExists()
        val dateRange = ZodiacSign.TAURUS.localizedDateRange("tr").uppercase(java.util.Locale.forLanguageTag("tr"))
        rule.onNodeWithText(dateRange).assertExists()
        val layouts = mutableListOf<TextLayoutResult>()
        summary.performSemanticsAction(SemanticsActions.GetTextLayoutResult) { action ->
            assertTrue("Text layout action failed", action(layouts))
        }
        assertEquals(1, layouts.size)
        assertEquals(
            longSummary,
            layouts
                .single()
                .layoutInput.text.text,
        )
        assertFalse("Daily summary is truncated/clipped by Text layout", layouts.single().hasVisualOverflow)

        val summaryBounds = summary.fetchSemanticsNode().boundsInRoot
        val titleBounds = title.fetchSemanticsNode().boundsInRoot
        assertTrue("Summary must follow the zodiac title", summaryBounds.top >= titleBounds.bottom)
        assertTrue("Summary must have a positive measured size", summaryBounds.width > 100f && summaryBounds.height > 0f)

        // Saved only in the isolated test app's device storage, not in the repository.
        val dir = java.io.File(instrumentation.targetContext.getExternalFilesDir(null), "daily-qa")
        assertTrue(dir.mkdirs() || dir.isDirectory)
        val file = java.io.File(dir, "daily-${width}dp-${if (config.fontScale > 1.5f) "200" else "100"}-${if (dark) "dark" else "light"}.png")
        val bitmap = rule.onRoot().captureToImage().asAndroidBitmap()
        val colors = mutableSetOf<Int>()
        for (y in 0 until bitmap.height step 32) {
            for (x in 0 until bitmap.width step 32) {
                colors.add(bitmap.getPixel(x, y))
            }
        }
        assertTrue("Device screenshot is blank or not rendered", colors.size > 8)
        file.outputStream().use { output -> assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) }
        bitmap.recycle()
    }

    @Test fun dark320() = verify(320, true)

    @Test fun light320() = verify(320, false)

    @Test fun dark360() = verify(360, true)

    @Test fun light360() = verify(360, false)
}
