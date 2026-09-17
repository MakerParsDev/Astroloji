package com.parsfilo.astrology.navigation

import android.net.Uri
import com.parsfilo.astrology.core.util.ZodiacSign

private const val SHARE_BASE_URL = "https://astrology.parsfilo.com/share"
private const val APP_SCHEME = "astrology"
private const val DAILY_HOST = "daily"
private const val SHARE_HOST = "astrology.parsfilo.com"
private const val EXPECTED_HTTPS_SEGMENT_COUNT = 3

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

internal fun parseAppDeepLink(uri: Uri?): AppDeepLink? {
    val unnormalizedSign = when {
        uri == null || uri.query != null || uri.fragment != null -> null
        uri.scheme == APP_SCHEME && uri.host == DAILY_HOST && uri.pathSegments.size == 1 -> uri.pathSegments[0]
        uri.scheme == "https" && uri.host == SHARE_HOST && uri.pathSegments.size == EXPECTED_HTTPS_SEGMENT_COUNT && uri.pathSegments[0] == "share" && uri.pathSegments[1] == "daily" -> uri.pathSegments[2]
        else -> null
    }
    val sign = normalizedSign(unnormalizedSign)
    return if (sign != null) AppDeepLink(type = DAILY_HOST, sign = sign) else null
}
