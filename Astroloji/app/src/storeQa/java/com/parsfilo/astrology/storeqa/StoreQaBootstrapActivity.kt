package com.parsfilo.astrology.storeqa

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.parsfilo.astrology.MainActivity
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.util.AppLanguageManager
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class StoreQaBootstrapActivity : AppCompatActivity() {
    @Inject
    lateinit var preferencesRepository: UserPreferencesRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val locale =
            intent.getStringExtra("locale")?.lowercase()
                ?: run {
                    finishAndRemoveTask()
                    return
                }
        if (locale !in setOf("tr", "en")) {
            finishAndRemoveTask()
            return
        }
        lifecycleScope.launch {
            AppLanguageManager.applyLanguage(this@StoreQaBootstrapActivity, locale)
            preferencesRepository.updateOnboarding(true, "aries", locale)
            startActivity(Intent(this@StoreQaBootstrapActivity, MainActivity::class.java))
            finish()
        }
    }
}
