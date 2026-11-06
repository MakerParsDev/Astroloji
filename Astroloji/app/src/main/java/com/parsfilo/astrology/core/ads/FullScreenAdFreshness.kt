package com.parsfilo.astrology.core.ads

// Google Mobile Ads documentation: cached interstitial and rewarded creatives expire in one hour.
// Check on existing preload/show triggers; never schedule periodic ad network requests.
internal const val FULL_SCREEN_AD_TTL_NANOS = 60L * 60L * 1_000_000_000L

/** Monotonic time prevents device-wall-clock changes from extending a cached creative's life. */
internal fun isFreshFullScreenAd(
    loadedAtNanos: Long,
    nowNanos: Long,
): Boolean =
    loadedAtNanos != 0L &&
        nowNanos >= loadedAtNanos &&
        nowNanos - loadedAtNanos < FULL_SCREEN_AD_TTL_NANOS
