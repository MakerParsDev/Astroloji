package com.parsfilo.astrology.core.data.repository

import android.content.Context
import com.android.billingclient.api.AcknowledgePurchaseResponseListener
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesResponseListener
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.domain.model.SubscriptionStatus
import com.parsfilo.astrology.core.util.AppResult
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.unmockkStatic
import io.mockk.verify
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Test

class BillingResumeReconciliationTest {
    @Test
    fun `pending purchase is not acknowledged or verified at resume`() {
        val session = mockk<SessionRepository>()
        val pending =
            mockk<Purchase> {
                every { purchaseState } returns Purchase.PurchaseState.PENDING
                every { products } returns listOf("premium_monthly")
            }
        withReadyBillingClient(session, listOf(pending)) { manager, client ->
            runBlocking { withTimeout(1_000) { manager.reconcilePurchasesOnResume() } }
            verify(exactly = 1) { client.queryPurchasesAsync(any(), any()) }
            verify(exactly = 0) { client.acknowledgePurchase(any(), any()) }
            coVerify(exactly = 0) { session.apiRestore(any()) }
            assertThat(manager.purchaseState.value).isNull()
        }
    }

    @Test
    fun `completed pending purchase is verified and acknowledged silently on resume`() {
        val session = mockk<SessionRepository>()
        val purchase =
            mockk<Purchase> {
                every { purchaseState } returns Purchase.PurchaseState.PURCHASED
                every { products } returns listOf("premium_monthly")
                every { purchaseTime } returns 100L
                every { purchaseToken } returns "synthetic-token"
                every { isAcknowledged } returns false
            }
        coEvery { session.apiRestore(any()) } returns
            AppResult.Success(
                SubscriptionStatus(isPremium = true, premiumExpiresAt = null, productId = "premium_monthly"),
            )
        withReadyBillingClient(session, listOf(purchase)) { manager, client ->
            runBlocking { withTimeout(1_000) { manager.reconcilePurchasesOnResume() } }
            coVerify(exactly = 1) {
                session.apiRestore(match { it.productId == "premium_monthly" && it.purchaseToken == "synthetic-token" })
            }
            verify(exactly = 1) { client.acknowledgePurchase(any(), any()) }
            assertThat(manager.purchaseState.value).isNull()
        }
    }

    @Test
    fun `expired backend subscription cannot restore premium or trigger purchase acknowledgement`() {
        val session = mockk<SessionRepository>()
        val purchase =
            mockk<Purchase> {
                every { purchaseState } returns Purchase.PurchaseState.PURCHASED
                every { products } returns listOf("premium_monthly")
                every { purchaseTime } returns 100L
                every { purchaseToken } returns "expired-synthetic-token"
                every { isAcknowledged } returns false
            }
        coEvery { session.apiRestore(any()) } returns
            AppResult.Success(
                SubscriptionStatus(isPremium = false, premiumExpiresAt = 0L, productId = "premium_monthly"),
            )
        withReadyBillingClient(session, listOf(purchase)) { manager, client ->
            val result = runBlocking { withTimeout(1_000) { manager.restorePurchases() } }
            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat(manager.purchaseState.value).isInstanceOf(AppResult.Error::class.java)
            coVerify(exactly = 1) { session.apiRestore(any()) }
            verify(exactly = 0) { client.acknowledgePurchase(any(), any()) }
        }
    }

    @Test
    fun `no existing subscription never produces a user-visible restore error`() {
        val session = mockk<SessionRepository>()
        withReadyBillingClient(session, emptyList()) { manager, _ ->
            runBlocking { withTimeout(1_000) { manager.reconcilePurchasesOnResume() } }
            coVerify(exactly = 0) { session.apiRestore(any()) }
            assertThat(manager.purchaseState.value).isNull()
        }
    }

    private fun withReadyBillingClient(
        sessionRepository: SessionRepository,
        purchases: List<Purchase>,
        block: (BillingManager, BillingClient) -> Unit,
    ) {
        val client = mockk<BillingClient>(relaxed = true)
        val builder = mockk<BillingClient.Builder>(relaxed = true)
        every { builder.setListener(any()) } returns builder
        every { builder.enablePendingPurchases(any()) } returns builder
        every { builder.enableAutoServiceReconnection() } returns builder
        every { builder.build() } returns client
        every { client.isReady } returns true
        every { client.queryPurchasesAsync(any(), any()) } answers {
            secondArg<PurchasesResponseListener>().onQueryPurchasesResponse(
                BillingResult.newBuilder().setResponseCode(BillingClient.BillingResponseCode.OK).build(),
                purchases,
            )
        }
        every { client.acknowledgePurchase(any(), any()) } answers {
            secondArg<AcknowledgePurchaseResponseListener>().onAcknowledgePurchaseResponse(
                BillingResult.newBuilder().setResponseCode(BillingClient.BillingResponseCode.OK).build(),
            )
        }
        mockkStatic(BillingClient::class)
        try {
            every { BillingClient.newBuilder(any()) } returns builder
            val manager = BillingManager(mockk<Context>(), sessionRepository, mockk(), mockk(relaxed = true))
            try {
                block(manager, client)
            } finally {
                manager.close()
            }
        } finally {
            unmockkStatic(BillingClient::class)
        }
    }
}
