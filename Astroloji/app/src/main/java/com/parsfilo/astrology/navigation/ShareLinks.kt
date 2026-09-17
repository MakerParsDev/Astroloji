package com.parsfilo.astrology.navigation

import android.net.Uri
import com.parsfilo.astrology.core.util.ZodiacSign

private const val SHARE_BASE_URL = "https://astrology.parsfilo.com/share"
private const val APP_SCHEME = "astrology"
private const val DAILY_HOST = "daily"

private fun normalizedSign(value: String?): String? =
    value
        ?.trim()
        ?.lowercase()
        ?.let(ZodiacSign::fromKeyOrNull)
        ?.key

internal fun dailyShareLandingUrl(sign: String): String? = normalizedSign(sign)?.let { "$SHARE_BASE_URL/daily/$it" }

internal fun compatibilityShareLandingUrl(
    firstSign: String,
    secondSign: String,
): String? =
    listOfNotNull(normalizedSign(firstSign), normalizedSign(secondSign))
        .takeIf { it.size == 2 }
        ?.sorted()
        ?.let { "$SHARE_BASE_URL/compat/${it[0]}/${it[1]}" }

internal fun dailyAppUri(sign: String): String? = normalizedSign(sign)?.let { "$APP_SCHEME://$DAILY_HOST/$it" }

private const val SHARE_HOST = "astrology.parsfilo.com"

internal fun parseAppDeepLink(uri: Uri?): AppDeepLink? {
    if (uri == null) return null
    if (uri.query != null || uri.fragment != null) return null

    if (uri.scheme == APP_SCHEME && uri.host == DAILY_HOST) {
        if (uri.pathSegments.size == 1) {
            val sign = normalizedSign(uri.pathSegments[0]) ?: return null
            return AppDeepLink(type = DAILY_HOST, sign = sign)
        }
        return null
    }

    if (uri.scheme == "https" && uri.host == SHARE_HOST) {
        if (uri.pathSegments.size == 3 && uri.pathSegments[0] == "share" && uri.pathSegments[1] == "daily") {
            val sign = normalizedSign(uri.pathSegments[2]) ?: return null
            return AppDeepLink(type = DAILY_HOST, sign = sign)
        }
        return null
    }

    return null
}
