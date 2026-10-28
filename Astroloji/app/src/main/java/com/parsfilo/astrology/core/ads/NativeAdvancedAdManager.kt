package com.parsfilo.astrology.core.ads

import android.content.Context
import com.google.android.gms.ads.AdListener
import com.google.android.gms.ads.AdLoader
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.nativead.NativeAd
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NativeAdvancedAdManager
    @Inject
    constructor(
        @param:ApplicationContext private val context: Context,
        private val consentManager: GoogleMobileAdsConsentManager,
    ) {
        private val cache =
            NativeAdCache(
                canRequestAds = { consentManager.canRequestAds },
                consentRevision = { consentManager.consentRevision },
            )
        val nativeAd: StateFlow<NativeAd?> = cache.ad

        init {
            // Native ads have no fullscreen show-time gate. Remove cached ads
            // immediately when privacy options or UMP permission are updated.
            CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate).launch {
                consentManager.consentSnapshotFlow.drop(1).collect { cache.clear() }
            }
        }

        fun preload() {
            val token = cache.beginLoad() ?: return
            AdLoader
                .Builder(context, AdMobUnits.nativeAdvanced)
                .forNativeAd { ad ->
                    if (cache.loaded(token, ad)) {
                        Timber.d("Native advanced ad loaded")
                    }
                }.withAdListener(
                    object : AdListener() {
                        override fun onAdFailedToLoad(error: LoadAdError) {
                            cache.failed(token)
                            Timber.w("Native advanced ad failed: %s", error.message)
                        }
                    },
                ).build()
                .loadAd(AdRequest.Builder().build())
        }

        fun clear() {
            cache.clear()
        }
    }
