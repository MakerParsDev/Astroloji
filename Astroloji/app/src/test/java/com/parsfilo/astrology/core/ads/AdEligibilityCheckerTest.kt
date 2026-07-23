package com.parsfilo.astrology.core.ads

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.domain.model.UserPreferences
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AdEligibilityCheckerTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val preferencesRepository = mockk<UserPreferencesRepository>()
    private val consentManager = mockk<GoogleMobileAdsConsentManager>()

    @Test
    fun `free users with consent can see banner interstitial rewarded and native ads`() =
        runTest {
            coEvery { preferencesRepository.current() } returns UserPreferences(isPremium = false)
            every { consentManager.canRequestAds } returns true

            val checker = AdEligibilityChecker(preferencesRepository, consentManager)

            assertThat(checker.canShowBannerAds()).isTrue()
            assertThat(checker.canShowInterstitial()).isTrue()
            assertThat(checker.canShowRewarded()).isTrue()
            assertThat(checker.canShowNative()).isTrue()
        }

    @Test
    fun `premium users or consent denial block all first-wave ad formats`() =
        runTest {
            coEvery { preferencesRepository.current() } returns UserPreferences(isPremium = true)
            every { consentManager.canRequestAds } returns true

            val checker = AdEligibilityChecker(preferencesRepository, consentManager)
            assertThat(checker.canShowBannerAds()).isFalse()
            assertThat(checker.canShowInterstitial()).isFalse()
            assertThat(checker.canShowRewarded()).isFalse()
            assertThat(checker.canShowNative()).isFalse()

            coEvery { preferencesRepository.current() } returns UserPreferences(isPremium = false)
            every { consentManager.canRequestAds } returns false

            assertThat(checker.canShowBannerAds()).isFalse()
            assertThat(checker.canShowInterstitial()).isFalse()
            assertThat(checker.canShowRewarded()).isFalse()
            assertThat(checker.canShowNative()).isFalse()
        }
}
