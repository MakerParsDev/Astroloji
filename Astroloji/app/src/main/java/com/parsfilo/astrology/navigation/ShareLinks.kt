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

internal fun parseAppDeepLink(uri: Uri?): AppDeepLink? =
    uri
        ?.takeIf {
            it.scheme == APP_SCHEME &&
                it.host == DAILY_HOST &&
                it.pathSegments.size == 1 &&
                it.query == null &&
                it.fragment == null
        }?.pathSegments
        ?.singleOrNull()
        ?.let(::normalizedSign)
        ?.let { AppDeepLink(type = DAILY_HOST, sign = it) }
