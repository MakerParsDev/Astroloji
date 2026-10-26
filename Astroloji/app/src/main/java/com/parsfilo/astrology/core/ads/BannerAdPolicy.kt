package com.parsfilo.astrology.core.ads

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * A cached banner must disappear as soon as the active entitlement or UMP
 * ad-request permission changes, without requiring navigation or refresh.
 */
internal fun bannerEligibilityFlow(
    premiumFlow: Flow<Boolean>,
    consentFlow: Flow<Boolean>,
): Flow<Boolean> =
    combine(premiumFlow, consentFlow) { isPremium, canRequestAds ->
        !isPremium && canRequestAds
    }.distinctUntilChanged()
