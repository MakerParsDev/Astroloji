package com.parsfilo.astrology.storeqa

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.lifecycle.lifecycleScope
import com.parsfilo.astrology.MainActivity
import com.parsfilo.astrology.core.data.local.AstrologyDatabase
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.util.AppLanguageManager
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
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
        if (locale !in setOf("tr", "en", "es", "pt", "de")) {
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
            }
            preferencesRepository.clearAll()
            preferencesRepository.updateOnboarding(true, "aries", locale)
            startActivity(Intent(this@StoreQaBootstrapActivity, MainActivity::class.java))
            finish()
        }
    }
}
