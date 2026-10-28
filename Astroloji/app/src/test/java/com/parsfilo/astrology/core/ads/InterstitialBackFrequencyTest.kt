package com.parsfilo.astrology.core.ads

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.domain.model.RemoteFlags
import com.parsfilo.astrology.core.domain.model.UserPreferences
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

class InterstitialBackFrequencyTest {
    private val preferencesRepository = mockk<UserPreferencesRepository>(relaxed = true)

    @Test
    fun `premium activation while pacing is checked blocks the actual ad`() =
        runTest {
            var premium = false
            var frequencyChecks = 0
            val eligible =
                isInterstitialBackStillEligible(
                    isFreeAndConsented = { !premium },
                    meetsFrequency = {
                        frequencyChecks += 1
                        premium = true
                        true
                    },
                )

            assertThat(eligible).isFalse()
            assertThat(frequencyChecks).isEqualTo(1)
        }

    @Test
    fun `consent revocation during pacing blocks ad without a second frequency count`() =
        runTest {
            var canRequestAds = true
            var checks = 0
            val eligible =
                isInterstitialBackStillEligible(
                    isFreeAndConsented = { canRequestAds },
                    meetsFrequency = {
                        checks += 1
                        canRequestAds = false
                        true
                    },
                )

            assertThat(eligible).isFalse()
            assertThat(checks).isEqualTo(1)
        }

    @Test
    fun `steady valid eligibility uses one frequency opportunity and allows ad`() =
        runTest {
            var eligibilityChecks = 0
            var frequencyChecks = 0
            val eligible =
                isInterstitialBackStillEligible(
                    isFreeAndConsented = {
                        eligibilityChecks += 1
                        true
                    },
                    meetsFrequency = {
                        frequencyChecks += 1
                        true
                    },
                )

            assertThat(eligible).isTrue()
            assertThat(eligibilityChecks).isEqualTo(2)
            assertThat(frequencyChecks).isEqualTo(1)
        }

    @Test
    fun `ineligible user never uses frequency opportunity`() =
        runTest {
            var frequencyChecks = 0
            val eligible =
                isInterstitialBackStillEligible(
                    isFreeAndConsented = { false },
                    meetsFrequency = {
                        frequencyChecks += 1
                        true
                    },
                )

            assertThat(eligible).isFalse()
            assertThat(frequencyChecks).isEqualTo(0)
        }

    @Test
    fun `only the configured BACK opportunity and later are eligible`() =
        runTest {
            coEvery { preferencesRepository.current() } returns UserPreferences()
            val manager = AdFrequencyManager(preferencesRepository)
            val flags =
                RemoteFlags(
                    interstitialFrequency = 3,
                    interstitialDailyLimit = 2,
                    interstitialCooldownMinutes = 0,
                )
            val now = 2_000_000_000_000L

            assertThat(manager.canShowInterstitialOnBack(flags, now)).isFalse()
            assertThat(manager.canShowInterstitialOnBack(flags, now)).isFalse()
            assertThat(manager.canShowInterstitialOnBack(flags, now)).isTrue()
            // No creative available: keep the threshold met until an impression.
            assertThat(manager.canShowInterstitialOnBack(flags, now)).isTrue()
        }

    @Test
    fun `an SDK impression resets the eligible BACK count`() =
        runTest {
            var persisted = UserPreferences()
            coEvery { preferencesRepository.current() } coAnswers { persisted }
            coEvery { preferencesRepository.updateInterstitialMetrics(any(), any(), any()) } coAnswers {
                persisted =
                    persisted.copy(
                        lastInterstitialShown = firstArg(),
                        interstitialCountToday = secondArg(),
                        interstitialCountDate = thirdArg(),
                    )
            }
            val manager = AdFrequencyManager(preferencesRepository)
            val flags =
                RemoteFlags(
                    interstitialFrequency = 2,
                    interstitialDailyLimit = 3,
                    interstitialCooldownMinutes = 0,
                )
            val now = 2_000_000_000_000L
            assertThat(manager.canShowInterstitialOnBack(flags, now)).isFalse()
            assertThat(manager.canShowInterstitialOnBack(flags, now)).isTrue()

            manager.recordInterstitialShown(now)
            assertThat(manager.canShowInterstitialOnBack(flags, now + 1000L)).isFalse()
            assertThat(manager.canShowInterstitialOnBack(flags, now + 1000L)).isTrue()
            assertThat(persisted.interstitialCountToday).isEqualTo(1)
        }

    @Test
    fun `invalid remote frequency fails closed`() =
        runTest {
            coEvery { preferencesRepository.current() } returns UserPreferences()
            val manager = AdFrequencyManager(preferencesRepository)
            val now = 2_000_000_000_000L
            for (frequency in listOf(0, -1)) {
                assertThat(
                    manager.canShowInterstitialOnBack(
                        RemoteFlags(interstitialFrequency = frequency, interstitialCooldownMinutes = 0),
                        now,
                    ),
                ).isFalse()
            }
        }

    @Test
    fun `daily cap and cooldown never advance the BACK opportunity count`() =
        runTest {
            val now = 2_000_000_000_000L
            var persisted =
                UserPreferences(
                    lastInterstitialShown = now,
                    interstitialCountToday = 1,
                    interstitialCountDate =
                        Instant
                            .ofEpochMilli(now)
                            .atZone(ZoneId.systemDefault())
                            .toLocalDate()
                            .toString(),
                )
            coEvery { preferencesRepository.current() } coAnswers { persisted }
            val manager = AdFrequencyManager(preferencesRepository)
            val flags =
                RemoteFlags(
                    interstitialFrequency = 2,
                    interstitialDailyLimit = 1,
                    interstitialCooldownMinutes = 30,
                )
            assertThat(manager.canShowInterstitialOnBack(flags, now)).isFalse()
            persisted = persisted.copy(interstitialCountToday = 0)
            assertThat(manager.canShowInterstitialOnBack(flags, now + 1000L)).isFalse()
            persisted = persisted.copy(lastInterstitialShown = 0)
            assertThat(manager.canShowInterstitialOnBack(flags, now + 1000L)).isFalse()
            assertThat(manager.canShowInterstitialOnBack(flags, now + 1000L)).isTrue()
        }
}
