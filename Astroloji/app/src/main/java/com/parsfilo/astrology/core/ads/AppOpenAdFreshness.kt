package com.parsfilo.astrology.core.ads

// Google Mobile Ads app-open ads expire four hours after loading.
internal const val APP_OPEN_AD_TTL_MS = 4 * 60 * 60 * 1_000L

internal fun isFreshAppOpenAd(
    loadedAtElapsedMs: Long,
    nowElapsedMs: Long,
): Boolean =
    loadedAtElapsedMs > 0L &&
        nowElapsedMs >= loadedAtElapsedMs &&
        nowElapsedMs - loadedAtElapsedMs < APP_OPEN_AD_TTL_MS
