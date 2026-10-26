package com.parsfilo.astrology.core.ads

import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.domain.model.RemoteFlags
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

        suspend fun canShowInterstitial(
            flags: RemoteFlags,
            nowMs: Long = System.currentTimeMillis(),
        ): Boolean =
            impressionMutex.withLock {
                val preferences = preferencesRepository.current()
                val today = nowMs.toDateKey()
                val dailyLimit = flags.interstitialDailyLimit.coerceAtLeast(0)
                if (dailyLimit == 0) {
                    return@withLock false
                }
                val isSameDay = preferences.interstitialCountDate == today
                val countToday = if (isSameDay) preferences.interstitialCountToday else 0
                if (countToday >= dailyLimit) {
                    return@withLock false
                }
                // A day boundary must not bypass the minimum interval between impressions.
                val cooldownMs = flags.interstitialCooldownMinutes.coerceAtLeast(0) * 60 * 1000L
                return@withLock nowMs - preferences.lastInterstitialShown >= cooldownMs
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

private fun Long.toDateKey(): String =
    Instant
        .ofEpochMilli(this)
        .atZone(ZoneId.systemDefault())
        .toLocalDate()
        .toString()
