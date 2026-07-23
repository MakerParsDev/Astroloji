package com.parsfilo.astrology.core.util

import android.app.Activity
import android.app.LocaleManager
import android.content.Context
import android.content.ContextWrapper
import android.os.Build
import android.os.LocaleList
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat

object AppLanguageManager {
    fun syncSystemLocales(context: Context) {
        val compatTags = AppCompatDelegate.getApplicationLocales().toLanguageTags()
        applyFrameworkLocales(context, compatTags)
    }

    fun applyLanguage(language: String?) {
        applyCompatLocales(language)
    }

    fun applyLanguage(
        context: Context,
        language: String?,
    ) {
        applyLanguage(
            context = context,
            language = language,
            userInitiated = true,
        )
    }

    private fun applyLanguage(
        context: Context,
        language: String?,
        userInitiated: Boolean,
    ) {
        val previousFrameworkTags = currentLanguageTags(context)
        val previousCompatTags = AppCompatDelegate.getApplicationLocales().toLanguageTags()
        applyFrameworkLocales(context, language)
        applyCompatLocales(language)
        val currentFrameworkTags = currentLanguageTags(context)
        val currentCompatTags = AppCompatDelegate.getApplicationLocales().toLanguageTags()
        if (
            shouldRecreateActivity(
                previousFrameworkTags = previousFrameworkTags,
                currentFrameworkTags = currentFrameworkTags,
                previousCompatTags = previousCompatTags,
                currentCompatTags = currentCompatTags,
                userInitiated = userInitiated,
            )
        ) {
            context.findActivity()?.let { activity ->
                if (!activity.isFinishing && !activity.isDestroyed) {
                    activity.recreate()
                }
            }
        }
    }

    internal fun shouldRecreateActivity(
        previousFrameworkTags: String,
        currentFrameworkTags: String,
        previousCompatTags: String,
        currentCompatTags: String,
        userInitiated: Boolean,
    ): Boolean {
        if (!userInitiated) return false
        return previousFrameworkTags != currentFrameworkTags || previousCompatTags != currentCompatTags
    }

    private fun applyCompatLocales(language: String?): LocaleListCompat {
        val locales =
            if (language.isNullOrBlank()) {
                LocaleListCompat.getEmptyLocaleList()
            } else {
                LocaleListCompat.forLanguageTags(language)
            }

        if (AppCompatDelegate.getApplicationLocales() != locales) {
            AppCompatDelegate.setApplicationLocales(locales)
        }
        return locales
    }

    private fun applyFrameworkLocales(
        context: Context,
        language: String?,
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val localeManager = context.getSystemService(LocaleManager::class.java) ?: return
        val locales =
            if (language.isNullOrBlank()) {
                LocaleList.getEmptyLocaleList()
            } else {
                LocaleList.forLanguageTags(language)
            }
        if (localeManager.applicationLocales.toLanguageTags() != locales.toLanguageTags()) {
            localeManager.applicationLocales = locales
        }
    }

    private fun currentLanguageTags(context: Context): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val localeManager = context.getSystemService(LocaleManager::class.java)
            return localeManager?.applicationLocales?.toLanguageTags().orEmpty()
        }
        return AppCompatDelegate.getApplicationLocales().toLanguageTags()
    }

    private tailrec fun Context.findActivity(): Activity? =
        when (this) {
            is Activity -> this
            is ContextWrapper -> baseContext.findActivity()
            else -> null
        }
}
