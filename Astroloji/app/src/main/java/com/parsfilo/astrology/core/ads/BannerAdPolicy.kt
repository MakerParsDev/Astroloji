package com.parsfilo.astrology.core.ads

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged

private const val MIN_ANCHORED_BANNER_WIDTH_DP = 320f

/**
 * Null removes the banner (premium or UMP disallowed). A new consent
 * revision replaces an existing banner even if canRequestAds stays true:
 * UMP privacy choices can change without toggling ad-request eligibility.
 */
internal fun bannerPresentationRevisionFlow(
    premiumFlow: Flow<Boolean>,
    consentFlow: Flow<AdConsentSnapshot>,
): Flow<Long?> =
    combine(premiumFlow, consentFlow) { isPremium, consent ->
        consent.revision.takeIf { !isPremium && consent.canRequestAds }
    }.distinctUntilChanged()

/**
 * Avoid requesting a 320dp banner in an undersized or unbounded Compose slot.
 * Invalid or narrower constraints don't reserve banner space or issue an ad request.
 */
internal fun adaptiveBannerWidthDp(availableWidthDp: Float): Int? {
    if (!availableWidthDp.isFinite() || availableWidthDp < MIN_ANCHORED_BANNER_WIDTH_DP) {
        return null
    }
    return availableWidthDp.toInt()
}
