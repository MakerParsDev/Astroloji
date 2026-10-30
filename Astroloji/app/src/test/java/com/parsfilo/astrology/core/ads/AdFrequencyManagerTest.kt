package com.parsfilo.astrology.core.ads

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.domain.model.RemoteFlags
import com.parsfilo.astrology.core.domain.model.UserPreferences
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test
import java.io.IOException
import java.time.LocalDate
import java.time.ZoneId

@OptIn(ExperimentalCoroutinesApi::class)
class AdFrequencyManagerTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val preferencesRepository = mockk<UserPreferencesRepository>(relaxed = true)

    @Test
    fun `daily limit and cooldown are enforced for interstitials`() =
        runTest {
            val localMidnight = LocalDate.of(1970, 1, 1).atStartOfDay(ZoneId.systemDefault())
            val startOfTestDay = localMidnight.toInstant().toEpochMilli()
            coEvery { preferencesRepository.current() } returns
                UserPreferences(
                    lastInterstitialShown = startOfTestDay + 1_000L,
                    interstitialCountToday = 3,
                    interstitialCountDate = "1970-01-01",
                )

            val manager = AdFrequencyManager(preferencesRepository)
            val flags = RemoteFlags(interstitialDailyLimit = 3, interstitialCooldownMinutes = 5)

            assertThat(manager.canShowInterstitial(flags, nowMs = startOfTestDay + 2_000L)).isFalse()
            assertThat(manager.canShowInterstitial(flags, nowMs = startOfTestDay + 1_000L + (6 * 60 * 1000L))).isFalse()
        }

    @Test
    fun `invalid persisted daily count must not make an exhausted quota eligible`() =
        runTest {
            val now =
                LocalDate
                    .of(2026, 10, 28)
                    .atStartOfDay(ZoneId.systemDefault())
                    .toInstant()
                    .toEpochMilli()
            coEvery { preferencesRepository.current() } returns
                UserPreferences(
                    lastInterstitialShown = 0L,
                    interstitialCountToday = -1,
                    interstitialCountDate = "2026-10-28",
                )

            val manager = AdFrequencyManager(preferencesRepository)
            val flags =
                RemoteFlags(
                    interstitialFrequency = 1,
                    interstitialDailyLimit = 3,
                    interstitialCooldownMinutes = 0,
                )

            assertThat(manager.canShowInterstitial(flags, nowMs = now)).isFalse()
            assertThat(manager.canShowInterstitialOnBack(flags, nowMs = now)).isFalse()
        }

    @Test
    fun `persisted impression counter saturates instead of wrapping negative`() =
        runTest {
            val now =
                LocalDate
                    .of(2026, 10, 28)
                    .atStartOfDay(ZoneId.systemDefault())
                    .toInstant()
                    .toEpochMilli()
            for (previousCount in listOf(Int.MAX_VALUE - 1, Int.MAX_VALUE, -1)) {
                coEvery { preferencesRepository.current() } returns
                    UserPreferences(
                        interstitialCountToday = previousCount,
                        interstitialCountDate = "2026-10-28",
                    )
                AdFrequencyManager(preferencesRepository).recordInterstitialShown(nowMs = now)
                coVerify(exactly = 1) {
                    preferencesRepository.updateInterstitialMetrics(
                        lastShown = now,
                        count = Int.MAX_VALUE,
                        date = "2026-10-28",
                    )
                }
                io.mockk.clearMocks(preferencesRepository, answers = false, recordedCalls = true)
            }
        }

    @Test
    fun `a zero daily limit disables interstitials even at midnight rollover`() =
        runTest {
            coEvery { preferencesRepository.current() } returns
                UserPreferences(
                    lastInterstitialShown = 0L,
                    interstitialCountToday = 0,
                    interstitialCountDate = "1970-01-01",
                )

            val manager = AdFrequencyManager(preferencesRepository)
            val flags = RemoteFlags(interstitialDailyLimit = 0, interstitialCooldownMinutes = 0)

            assertThat(manager.canShowInterstitial(flags, nowMs = 0L)).isFalse()
            assertThat(manager.canShowInterstitial(flags, nowMs = 24 * 60 * 60 * 1000L)).isFalse()
        }

    @Test
    fun `cooldown remains enforced when the calendar day changes`() =
        runTest {
            val localMidnight = LocalDate.of(1970, 1, 2).atStartOfDay(ZoneId.systemDefault())
            val startOfNewDay = localMidnight.toInstant().toEpochMilli()
            coEvery { preferencesRepository.current() } returns
                UserPreferences(
                    lastInterstitialShown = startOfNewDay - 60_000L,
                    interstitialCountToday = 3,
                    interstitialCountDate = "1970-01-01",
                )

            val manager = AdFrequencyManager(preferencesRepository)
            val flags = RemoteFlags(interstitialDailyLimit = 3, interstitialCooldownMinutes = 5)

            assertThat(manager.canShowInterstitial(flags, nowMs = startOfNewDay)).isFalse()
            assertThat(manager.canShowInterstitial(flags, nowMs = startOfNewDay + 5 * 60_000L)).isTrue()
        }

    @Test
    fun `a pending impression blocks eligibility until the quota write commits`() =
        runTest {
            val localMidnight = LocalDate.of(2026, 10, 23).atStartOfDay(ZoneId.systemDefault())
            val now = localMidnight.toInstant().toEpochMilli() + 8 * 60 * 60_000L
            var persisted = UserPreferences(interstitialCountDate = "2026-10-23")
            val releaseWrite = CompletableDeferred<Unit>()
            coEvery { preferencesRepository.current() } coAnswers { persisted }
            coEvery { preferencesRepository.updateInterstitialMetrics(any(), any(), any()) } coAnswers {
                releaseWrite.await()
                persisted =
                    persisted.copy(
                        lastInterstitialShown = firstArg(),
                        interstitialCountToday = secondArg(),
                        interstitialCountDate = thirdArg(),
                    )
            }

            val manager = AdFrequencyManager(preferencesRepository)
            val impression = launch { manager.recordInterstitialShown(now) }
            runCurrent()

            val eligible =
                async {
                    manager.canShowInterstitial(
                        RemoteFlags(interstitialDailyLimit = 1, interstitialCooldownMinutes = 30),
                        nowMs = now + 1000L,
                    )
                }
            runCurrent()
            assertThat(eligible.isCompleted).isFalse()

            releaseWrite.complete(Unit)
            impression.join()
            assertThat(eligible.await()).isFalse()
            assertThat(persisted.interstitialCountToday).isEqualTo(1)
        }

    @Test
    fun `parallel impression writes cannot lose a daily increment`() =
        runTest {
            val localMidnight = LocalDate.of(2026, 10, 23).atStartOfDay(ZoneId.systemDefault())
            val now = localMidnight.toInstant().toEpochMilli() + 8 * 60 * 60_000L
            var persisted = UserPreferences(interstitialCountDate = "2026-10-23")
            val firstWriteGate = CompletableDeferred<Unit>()
            var writes = 0
            coEvery { preferencesRepository.current() } coAnswers { persisted }
            coEvery { preferencesRepository.updateInterstitialMetrics(any(), any(), any()) } coAnswers {
                writes += 1
                if (writes == 1) firstWriteGate.await()
                persisted =
                    persisted.copy(
                        lastInterstitialShown = firstArg(),
                        interstitialCountToday = secondArg(),
                        interstitialCountDate = thirdArg(),
                    )
            }
            val manager = AdFrequencyManager(preferencesRepository)
            val first = launch { manager.recordInterstitialShown(now) }
            runCurrent()
            val second = launch { manager.recordInterstitialShown(now + 100L) }
            runCurrent()
            assertThat(writes).isEqualTo(1)

            firstWriteGate.complete(Unit)
            first.join()
            second.join()
            assertThat(writes).isEqualTo(2)
            assertThat(persisted.interstitialCountToday).isEqualTo(2)
        }

    @Test
    fun `failed impression persistence blocks further interstitials during this process`() =
        runTest {
            val today = LocalDate.of(2026, 10, 30)
            val now = today.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli() + 40_000L
            coEvery { preferencesRepository.current() } returns
                UserPreferences(
                    lastInterstitialShown = 0L,
                    interstitialCountToday = 0,
                    interstitialCountDate = today.toString(),
                )
            coEvery { preferencesRepository.updateInterstitialMetrics(any(), any(), any()) } throws
                IOException("disk unavailable")

            val manager = AdFrequencyManager(preferencesRepository)
            val flags =
                RemoteFlags(
                    interstitialFrequency = 1,
                    interstitialDailyLimit = 1,
                    interstitialCooldownMinutes = 0,
                )
            assertThat(manager.canShowInterstitial(flags, now)).isTrue()

            try {
                manager.recordInterstitialShown(now)
                org.junit.Assert.fail("The failed write must propagate for caller logging")
            } catch (expected: IOException) {
                assertThat(expected.message).isEqualTo("disk unavailable")
            }

            // Stored quota remains zero. Do not re-show against stale quota state.
            assertThat(manager.canShowInterstitial(flags, now + 1000L)).isFalse()
            assertThat(manager.canShowInterstitialOnBack(flags, now + 1000L)).isFalse()
        }

    @Test
    fun `impression read failure blocks stale quota after storage recovers`() =
        runTest {
            val today = LocalDate.of(2026, 10, 30)
            val now = today.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli() + 65_000L
            val stalePreferences =
                UserPreferences(
                    lastInterstitialShown = 0L,
                    interstitialCountToday = 0,
                    interstitialCountDate = today.toString(),
                )
            var readAttempts = 0
            coEvery { preferencesRepository.current() } coAnswers {
                readAttempts += 1
                if (readAttempts == 2) throw IOException("transient DataStore read failure")
                stalePreferences
            }

            val manager = AdFrequencyManager(preferencesRepository)
            val flags =
                RemoteFlags(
                    interstitialFrequency = 1,
                    interstitialDailyLimit = 1,
                    interstitialCooldownMinutes = 0,
                )
            assertThat(manager.canShowInterstitial(flags, now)).isTrue()
            try {
                manager.recordInterstitialShown(now)
                org.junit.Assert.fail("Impression read error should propagate")
            } catch (expected: IOException) {
                assertThat(expected.message).isEqualTo("transient DataStore read failure")
            }

            // A later successful read must not resurrect the unsaved ad quota.
            assertThat(manager.canShowInterstitial(flags, now + 1000L)).isFalse()
            assertThat(manager.canShowInterstitialOnBack(flags, now + 1000L)).isFalse()
            coVerify(exactly = 0) { preferencesRepository.updateInterstitialMetrics(any(), any(), any()) }
        }

    @Test
    fun `new day resets interstitial counters and record updates persisted state`() =
        runTest {
            val localMidnight = LocalDate.of(1970, 1, 2).atStartOfDay(ZoneId.systemDefault())
            val startOfNewDay = localMidnight.toInstant().toEpochMilli()
            coEvery { preferencesRepository.current() } returns
                UserPreferences(
                    lastInterstitialShown = 0L,
                    interstitialCountToday = 2,
                    interstitialCountDate = "1970-01-01",
                )

            val manager = AdFrequencyManager(preferencesRepository)
            val flags = RemoteFlags(interstitialDailyLimit = 3, interstitialCooldownMinutes = 5)

            assertThat(manager.canShowInterstitial(flags, nowMs = startOfNewDay)).isTrue()

            manager.recordInterstitialShown(nowMs = startOfNewDay)

            coVerify {
                preferencesRepository.updateInterstitialMetrics(
                    lastShown = startOfNewDay,
                    count = 1,
                    date = "1970-01-02",
                )
            }
        }
}
