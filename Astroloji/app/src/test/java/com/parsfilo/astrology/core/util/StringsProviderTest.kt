package com.parsfilo.astrology.core.util

import android.content.Context
import android.os.Looper
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.R
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * AppCompatDelegate only initializes its per-app locale tracking once an
 * AppCompatActivity has attached, so these tests spin up a real (Robolectric)
 * one instead of a bare application context.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class StringsProviderTest {
    private val applicationContext: Context

    init {
        val activity =
            Robolectric
                .buildActivity(AppCompatActivity::class.java)
                .create()
                .start()
                .resume()
                .get()
        applicationContext = activity.applicationContext
    }

    @After
    fun tearDown() {
        setApplicationLocales(LocaleListCompat.getEmptyLocaleList())
    }

    @Test
    fun `resolves strings in the selected app locale rather than the stale base context locale`() {
        setApplicationLocales(LocaleListCompat.forLanguageTags("es"))

        assertThat(StringsProvider(applicationContext).get(R.string.common_retry)).isEqualTo("Reintentar")
    }

    @Test
    fun `falls back to the base context when no locale override is selected`() {
        setApplicationLocales(LocaleListCompat.getEmptyLocaleList())

        assertThat(StringsProvider(applicationContext).get(R.string.common_retry))
            .isEqualTo(applicationContext.getString(R.string.common_retry))
    }

    private fun setApplicationLocales(locales: LocaleListCompat) {
        AppCompatDelegate.setApplicationLocales(locales)
        shadowOf(Looper.getMainLooper()).idle()
    }
}
