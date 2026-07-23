package com.parsfilo.astrology.core.ads

import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AdEligibilityChecker
    @Inject
    constructor(
        private val preferencesRepository: UserPreferencesRepository,
        private val consentManager: GoogleMobileAdsConsentManager,
    ) {
        suspend fun canShowAds(): Boolean = canShowFreeOnlyAds()

        suspend fun canShowBannerAds(): Boolean = canShowAds()

        suspend fun canShowInterstitial(): Boolean = canShowAds()

        suspend fun canShowRewarded(): Boolean = canShowFreeOnlyAds()

        suspend fun canShowNative(): Boolean = canShowAds()

        private suspend fun canShowFreeOnlyAds(): Boolean {
            val preferences = preferencesRepository.current()
            return !preferences.isPremium && consentManager.canRequestAds
        }
    }
