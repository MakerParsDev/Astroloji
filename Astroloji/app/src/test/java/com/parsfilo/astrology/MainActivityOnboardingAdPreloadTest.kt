package com.parsfilo.astrology

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.domain.model.UserPreferences
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import org.junit.Test

class MainActivityOnboardingAdPreloadTest {
    @Test
    fun `first onboarding completion triggers one preload without Activity restart`() =
        runTest {
            val preferences = MutableStateFlow(UserPreferences(onboardingCompleted = false))
            var preloads = 0
            val job =
                launch(start = CoroutineStart.UNDISPATCHED) {
                    awaitOnboardingCompletionForAds(preferences) { preloads++ }
                }
            assertThat(preloads).isEqualTo(0)
            preferences.value = UserPreferences(onboardingCompleted = true)
            job.join()
            assertThat(preloads).isEqualTo(1)
            preferences.value = UserPreferences(onboardingCompleted = false)
            preferences.value = UserPreferences(onboardingCompleted = true)
            assertThat(preloads).isEqualTo(1)
        }

    @Test
    fun `already completed onboarding is observed without a missed transition`() =
        runTest {
            val preferences = MutableStateFlow(UserPreferences(onboardingCompleted = true))
            var preloads = 0

            awaitOnboardingCompletionForAds(preferences) { preloads++ }

            assertThat(preloads).isEqualTo(1)
        }
}
