package com.parsfilo.astrology.feature.premium

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class StoreScreenshotQaBillingTest {
    @Test
    fun `qa plans preserve monthly and weekly production cadence`() {
        val tr = storeScreenshotQaPlans("tr")

        assertThat(tr.map { it.productId }).containsExactly("premium_monthly", "premium_weekly").inOrder()
        assertThat(tr.map { it.basePlanId }).containsExactly("monthly", "weekly").inOrder()
        assertThat(tr.map { it.billingPeriod }).containsExactly("P1M", "P1W").inOrder()
        assertThat(tr[0].price).isEqualTo("₺394,99")
        assertThat(tr[1].price).isEqualTo("₺129,99")

        val en = storeScreenshotQaPlans("en")
        assertThat(en[0].price).isEqualTo("$6.99")
        assertThat(en[1].price).isEqualTo("$2.29")
    }

    @Test
    fun `qa catalogue never calls live loader`() =
        runTest {
            var liveCalls = 0

            val result =
                resolvePremiumCatalogue(storeScreenshotQa = true, language = "en") {
                    liveCalls += 1
                    error("live billing must not run in store QA")
                }

            assertThat(liveCalls).isEqualTo(0)
            assertThat(result).isInstanceOf(
                com.parsfilo.astrology.core.data.repository.BillingCatalogueLoadResult.Success::class.java,
            )
        }
}
