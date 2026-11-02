package com.parsfilo.astrology.storeqa

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.lifecycle.lifecycleScope
import com.parsfilo.astrology.MainActivity
import com.parsfilo.astrology.core.data.local.AstrologyDatabase
import com.parsfilo.astrology.core.data.local.MonthlyHoroscopeEntity
import com.parsfilo.astrology.core.data.local.WeeklyHoroscopeEntity
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.util.AppLanguageManager
import com.parsfilo.astrology.core.util.TimeUtils
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.DayOfWeek
import java.time.temporal.TemporalAdjusters
import javax.inject.Inject

@AndroidEntryPoint
class StoreQaBootstrapActivity : AppCompatActivity() {
    @Inject
    lateinit var preferencesRepository: UserPreferencesRepository

    @Inject
    lateinit var database: AstrologyDatabase

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val locale =
            intent.getStringExtra("locale")?.lowercase()
                ?: run {
                    finishAndRemoveTask()
                    return
                }
        if (locale !in setOf("tr", "en", "es", "pt", "de", "fr")) {
            finishAndRemoveTask()
            return
        }
        val currentLocale =
            AppCompatDelegate
                .getApplicationLocales()
                .toLanguageTags()
                .substringBefore('-')
                .lowercase()
        if (currentLocale != locale) {
            AppLanguageManager.applyLanguage(this@StoreQaBootstrapActivity, locale)
            return
        }
        lifecycleScope.launch {
            withContext(Dispatchers.IO) {
                database.clearAllTables()
                // Render the real free-tier weekly/monthly screens without requesting
                // a personal account or fabricating paid forecasts or entitlements.
                // Cache entries are isolated to the storeQa application ID.
                val today = TimeUtils.currentLocalDate()
                val weekStart = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
                database.weeklyDao().upsert(
                    WeeklyHoroscopeEntity(
                        sign = "aries",
                        week = TimeUtils.weekIdentifier(today),
                        weekStart = weekStart.toString(),
                        weekEnd = weekStart.plusDays(6).toString(),
                        language = locale,
                        summary = null,
                        love = null,
                        career = null,
                        money = null,
                        bestDay = null,
                        warning = null,
                        cachedAt = System.currentTimeMillis(),
                    ),
                )
                database.monthlyDao().upsert(
                    MonthlyHoroscopeEntity(
                        sign = "aries",
                        month = TimeUtils.monthIdentifier(today),
                        language = locale,
                        monthStart = today.withDayOfMonth(1).toString(),
                        monthEnd = today.withDayOfMonth(today.lengthOfMonth()).toString(),
                        summary = null,
                        love = null,
                        career = null,
                        money = null,
                        bestDay = null,
                        warning = null,
                        cachedAt = System.currentTimeMillis(),
                    ),
                )
            }
            preferencesRepository.clearAll()
            preferencesRepository.updateOnboarding(true, "aries", locale)
            startActivity(Intent(this@StoreQaBootstrapActivity, MainActivity::class.java))
            finish()
        }
    }
}
