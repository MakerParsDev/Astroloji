package com.parsfilo.astrology.core.ads

import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.domain.model.RemoteFlags
import com.parsfilo.astrology.core.domain.model.UserPreferences
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant
import java.time.ZoneId
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AdFrequencyManager
    @Inject
    constructor(
        private val preferencesRepository: UserPreferencesRepository,
    ) {
        // One manager owns all interstitial counter accesses. Serializing eligibility
        // with persistence avoids lost updates and stale cap decisions.
        private val impressionMutex = Mutex()

        // Process-local, conservative pacing: a restart requires a new full
        // interval instead of serving an ad sooner than the remote frequency.
        private var eligibleBacksSinceImpression = 0

        suspend fun canShowInterstitial(
            flags: RemoteFlags,
            nowMs: Long = System.currentTimeMillis(),
        ): Boolean =
            impressionMutex.withLock {
                meetsQuotaAndCooldown(flags, preferencesRepository.current(), nowMs)
            }

        /** Apply frequency only to eligible BACK opportunities, not mere loads. */
        suspend fun canShowInterstitialOnBack(
            flags: RemoteFlags,
            nowMs: Long = System.currentTimeMillis(),
        ): Boolean =
            impressionMutex.withLock {
                val frequency = flags.interstitialFrequency
                if (frequency <= 0 || !meetsQuotaAndCooldown(flags, preferencesRepository.current(), nowMs)) {
                    return@withLock false
                }
                if (eligibleBacksSinceImpression < frequency) {
                    eligibleBacksSinceImpression += 1
                }
                eligibleBacksSinceImpression >= frequency
            }

        private fun meetsQuotaAndCooldown(
            flags: RemoteFlags,
            preferences: UserPreferences,
            nowMs: Long,
        ): Boolean {
            val dailyLimit = flags.interstitialDailyLimit.coerceAtLeast(0)
            val today = nowMs.toDateKey()
            val countToday =
                if (preferences.interstitialCountDate == today) preferences.interstitialCountToday else 0
            // Day rollover cannot bypass a cooldown; convert before multiplying.
            val cooldownMs = flags.interstitialCooldownMinutes.coerceAtLeast(0).toLong() * MILLIS_PER_MINUTE
            return dailyLimit > 0 &&
                countToday < dailyLimit &&
                nowMs - preferences.lastInterstitialShown >= cooldownMs
        }

        suspend fun resetIfNewDay(nowMs: Long = System.currentTimeMillis()) =
            impressionMutex.withLock {
                val preferences = preferencesRepository.current()
                val today = nowMs.toDateKey()
                if (preferences.interstitialCountDate == today) {
                    return@withLock
                }
                preferencesRepository.updateInterstitialMetrics(
                    lastShown = preferences.lastInterstitialShown,
                    count = 0,
                    date = today,
                )
            }

        suspend fun recordInterstitialShown(nowMs: Long = System.currentTimeMillis()) =
            impressionMutex.withLock {
                eligibleBacksSinceImpression = 0
                val preferences = preferencesRepository.current()
                val today = nowMs.toDateKey()
                val nextCount =
                    if (preferences.interstitialCountDate == today) {
                        preferences.interstitialCountToday + 1
                    } else {
                        1
                    }
                preferencesRepository.updateInterstitialMetrics(
                    lastShown = nowMs,
                    count = nextCount,
                    date = today,
                )
            }
    }

private const val MILLIS_PER_MINUTE = 60_000L

private fun Long.toDateKey(): String =
    Instant
        .ofEpochMilli(this)
        .atZone(ZoneId.systemDefault())
        .toLocalDate()
        .toString()
