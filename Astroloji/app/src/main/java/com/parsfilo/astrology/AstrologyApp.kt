package com.parsfilo.astrology

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.google.firebase.FirebaseApp
import com.parsfilo.astrology.core.util.AppLanguageManager
import com.parsfilo.astrology.core.util.firebase.AppCheckInstaller
import com.parsfilo.astrology.notification.NotificationChannels
import com.parsfilo.astrology.notification.WorkScheduler
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber
import javax.inject.Inject

@HiltAndroidApp
class AstrologyApp :
    Application(),
    Configuration.Provider {
    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    override val workManagerConfiguration: Configuration
        get() =
            Configuration
                .Builder()
                .setWorkerFactory(workerFactory)
                .build()

    override fun onCreate() {
        super.onCreate()
        AppLanguageManager.syncSystemLocales(this)

        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }

        runCatching {
            FirebaseApp.initializeApp(this)
            AppCheckInstaller.install()
        }.onFailure { Timber.w(it, "Firebase initialization is deferred until config is provided.") }

        NotificationChannels.create(this)
        WorkScheduler.schedule(this)
    }
}
