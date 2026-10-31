package com.parsfilo.astrology.core.data.repository

import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.QueryPurchasesParams
import kotlinx.coroutines.suspendCancellableCoroutine
import timber.log.Timber
import java.io.IOException
import kotlin.coroutines.resume

/**
 * A background-to-foreground transition can complete an earlier pending order.
 * Never start checkout here or publish a user-facing purchase result.
 * A competing checkout or manual restore owns the same gate and wins.
 */
internal suspend fun reconcileVerifiedSubscriptions(
    gate: BillingCheckoutGate,
    isBillingReady: suspend () -> Boolean,
    queryPurchases: suspend () -> Pair<BillingResult, List<Purchase>>,
    verify: suspend (Purchase) -> Unit,
) {
    if (!gate.tryStart(PendingBillingFlow.RESTORE)) return
    try {
        findPurchasedSubscription(isBillingReady, queryPurchases)?.let { verify(it) }
    } catch (e: IOException) {
        Timber.w("Play subscription recovery unavailable: %s", e.javaClass.simpleName)
    } catch (e: IllegalStateException) {
        Timber.w("Play subscription recovery unavailable: %s", e.javaClass.simpleName)
    } finally {
        gate.finish(PendingBillingFlow.RESTORE)
    }
}

internal suspend fun BillingClient.querySubscriptionPurchases(): Pair<BillingResult, List<Purchase>> =
    suspendCancellableCoroutine { continuation ->
        queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
        ) { result, purchases ->
            if (continuation.isActive) continuation.resume(result to purchases)
        }
    }

private suspend fun findPurchasedSubscription(
    isBillingReady: suspend () -> Boolean,
    queryPurchases: suspend () -> Pair<BillingResult, List<Purchase>>,
): Purchase? {
    if (!isBillingReady()) return null
    val (result, purchases) = queryPurchases()
    return if (result.responseCode == BillingClient.BillingResponseCode.OK) {
        selectPurchaseForVerification(purchases)
    } else {
        null
    }
}
