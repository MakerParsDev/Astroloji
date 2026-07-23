package com.parsfilo.astrology.core.ads

import android.content.Context
import com.google.android.gms.ads.MobileAds
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AdsInitializer
    @Inject
    constructor(
        @param:ApplicationContext private val context: Context,
        private val consentManager: GoogleMobileAdsConsentManager,
    ) {
        private val initialized = AtomicBoolean(false)

        suspend fun initializeIfNeeded() {
            if (!consentManager.canRequestAds || initialized.get()) return
            withContext(Dispatchers.Main.immediate) {
                if (initialized.compareAndSet(false, true)) {
                    MobileAds.initialize(context) {
                        Timber.d("Google Mobile Ads initialized")
                    }
                }
            }
        }
    }
