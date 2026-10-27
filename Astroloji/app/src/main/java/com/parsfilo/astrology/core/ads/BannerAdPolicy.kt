package com.parsfilo.astrology.core.ads

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged

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
