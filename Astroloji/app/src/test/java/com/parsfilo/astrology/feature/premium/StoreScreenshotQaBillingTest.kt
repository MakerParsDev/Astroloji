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
        assertThat(en.map { it.productId }).containsExactly("premium_monthly", "premium_weekly").inOrder()
        assertThat(en.map { it.basePlanId }).containsExactly("monthly", "weekly").inOrder()
        assertThat(en.map { it.billingPeriod }).containsExactly("P1M", "P1W").inOrder()
        assertThat(en[0].price).isEqualTo("$6.99")
        assertThat(en[1].price).isEqualTo("$2.29")

        val de = storeScreenshotQaPlans("de")
        assertThat(de[0].title).isEqualTo("Monatliches Premium")
        assertThat(de[0].price).isEqualTo("6,99 €")
        assertThat(de[1].title).isEqualTo("Wöchentliches Premium")
        assertThat(de[1].price).isEqualTo("2,29 €")

        val fr = storeScreenshotQaPlans("fr")
        assertThat(fr[0].title).isEqualTo("Premium mensuel")
        assertThat(fr[0].price).isEqualTo("6,99 €")
        assertThat(fr[1].title).isEqualTo("Premium hebdomadaire")
        assertThat(fr[1].price).isEqualTo("2,29 €")

        // Unrecognized language codes fall back to the English copy rather than crashing.
        val unknown = storeScreenshotQaPlans("xx")
        assertThat(unknown[0].price).isEqualTo("$6.99")
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

    @Test
    fun `non qa catalogue calls live loader once and returns its result`() =
        runTest {
            var liveCalls = 0
            val expected =
                com.parsfilo.astrology.core.data.repository.BillingCatalogueLoadResult.Failure(
                    message = "live catalogue result",
                    diagnostics = emptyList(),
                )

            val result =
                resolvePremiumCatalogue(storeScreenshotQa = false, language = "en") {
                    liveCalls += 1
                    expected
                }

            assertThat(liveCalls).isEqualTo(1)
            assertThat(result).isEqualTo(expected)
        }
}
