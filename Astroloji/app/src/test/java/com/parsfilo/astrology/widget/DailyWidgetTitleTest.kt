package com.parsfilo.astrology.widget

import android.content.Context
import android.content.res.Configuration
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.util.ZodiacSign
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.Locale

@RunWith(RobolectricTestRunner::class)
class DailyWidgetTitleTest {
    private val languages =
        mapOf(
            "en" to "Today's energy",
            "tr" to "Bugünün enerjisi",
            "de" to "Die heutige Energie",
            "fr" to "L'énergie du jour",
            "pt" to "Energia de hoje",
            "es" to "Energía de hoy",
        )

    @Test
    fun selectedZodiacSymbolMatchesEveryLocale() {
        val app = ApplicationProvider.getApplicationContext<Context>()
        languages.forEach { (language, title) ->
            val config = Configuration(app.resources.configuration)
            config.setLocale(Locale.forLanguageTag(language))
            val context = app.createConfigurationContext(config)
            ZodiacSign.entries.forEach { sign ->
                assertThat(dailyWidgetTitle(context, sign.key)).isEqualTo("${sign.symbol} $title")
            }
        }
    }

    @Test
    fun unknownLegacySignFallsBackToAries() {
        val app = ApplicationProvider.getApplicationContext<Context>()
        assertThat(dailyWidgetTitle(app, "unknown-sign")).startsWith(ZodiacSign.ARIES.symbol)
    }
}
