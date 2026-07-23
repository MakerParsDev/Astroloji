package com.parsfilo.astrology.core.ads

import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.domain.model.RemoteFlags
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
        suspend fun canShowInterstitial(
            flags: RemoteFlags,
            nowMs: Long = System.currentTimeMillis(),
        ): Boolean {
            val preferences = preferencesRepository.current()
            val today = nowMs.toDateKey()
            val isSameDay = preferences.interstitialCountDate == today
            val cooldownMs = flags.interstitialCooldownMinutes.coerceAtLeast(0) * 60 * 1000L
            if (!isSameDay) {
                return true
            }
            if (preferences.interstitialCountToday >= flags.interstitialDailyLimit.coerceAtLeast(0)) {
                return false
            }
            return nowMs - preferences.lastInterstitialShown >= cooldownMs
        }

        suspend fun resetIfNewDay(nowMs: Long = System.currentTimeMillis()) {
            val preferences = preferencesRepository.current()
            val today = nowMs.toDateKey()
            if (preferences.interstitialCountDate == today) {
                return
            }
            preferencesRepository.updateInterstitialMetrics(
                lastShown = preferences.lastInterstitialShown,
                count = 0,
                date = today,
            )
        }

        suspend fun recordInterstitialShown(nowMs: Long = System.currentTimeMillis()) {
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
