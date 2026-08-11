package com.parsfilo.astrology.core.util

import android.content.Context
import android.content.res.Configuration
import android.os.LocaleList
import androidx.annotation.StringRes
import androidx.appcompat.app.AppCompatDelegate
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Resolves strings through a configuration context matching the user's in-app
 * language selection. A plain Application context does not pick up
 * AppCompatDelegate's per-app locale on API < 33 (no platform LocaleManager),
 * so resolving through it directly would silently serve the device's base
 * locale instead of the language the user picked in Settings/onboarding.
 */
@Singleton
class StringsProvider
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
    ) {
        fun get(
            @StringRes resId: Int,
            vararg args: Any,
        ): String = localizedContext().getString(resId, *args)

        private fun localizedContext(): Context {
            val locales = AppCompatDelegate.getApplicationLocales()
            if (locales.isEmpty) return context
            val configuration = Configuration(context.resources.configuration)
            configuration.setLocales(locales.unwrap() as LocaleList)
            return context.createConfigurationContext(configuration)
        }
    }
