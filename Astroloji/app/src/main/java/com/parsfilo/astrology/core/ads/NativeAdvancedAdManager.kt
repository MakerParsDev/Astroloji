package com.parsfilo.astrology.core.ads

import android.content.Context
import com.google.android.gms.ads.AdListener
import com.google.android.gms.ads.AdLoader
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.nativead.NativeAd
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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
        private var isLoading = false
        private val _nativeAd = MutableStateFlow<NativeAd?>(null)
        val nativeAd: StateFlow<NativeAd?> = _nativeAd.asStateFlow()

        fun preload() {
            if (isLoading || _nativeAd.value != null || !consentManager.canRequestAds) return
            isLoading = true
            AdLoader
                .Builder(context, AdMobUnits.nativeAdvanced)
                .forNativeAd { ad ->
                    _nativeAd.value?.destroy()
                    _nativeAd.value = ad
                    isLoading = false
                    Timber.d("Native advanced ad loaded")
                }.withAdListener(
                    object : AdListener() {
                        override fun onAdFailedToLoad(error: LoadAdError) {
                            isLoading = false
                            Timber.w("Native advanced ad failed: %s", error.message)
                        }
                    },
                ).build()
                .loadAd(AdRequest.Builder().build())
        }

        fun clear() {
            _nativeAd.value?.destroy()
            _nativeAd.value = null
        }
    }
