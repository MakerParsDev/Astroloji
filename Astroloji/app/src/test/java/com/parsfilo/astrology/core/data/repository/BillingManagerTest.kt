package com.parsfilo.astrology.core.data.repository

import com.android.billingclient.api.BillingClient
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BillingManagerTest {
    @Test
    fun `billing setup is ready only for ok response codes`() {
        assertThat(isSuccessfulBillingSetup(BillingClient.BillingResponseCode.OK)).isTrue()
        assertThat(isSuccessfulBillingSetup(BillingClient.BillingResponseCode.SERVICE_DISCONNECTED)).isFalse()
    }

    @Test
    fun `recognized purchase product resolution requires a single known premium sku`() {
        assertThat(resolveRecognizedProductId(listOf("premium_yearly"))).isEqualTo("premium_yearly")
        assertThat(resolveRecognizedProductId(listOf("premium_yearly", "premium_monthly"))).isNull()
        assertThat(resolveRecognizedProductId(listOf("unknown_sku"))).isNull()
    }

    @Test
    fun `plan ids are stable across base plan and offer variants`() {
        assertThat(buildPlanId("premium_yearly", "yearly", "trial"))
            .isEqualTo("premium_yearly:yearly:trial")
        assertThat(buildPlanId("premium_monthly", null, null))
            .isEqualTo("premium_monthly:base:default")
    }

    @Test
    fun `preferred offer index prioritizes free trial offers`() {
        assertThat(selectPreferredOfferIndex(listOf(false, true, false))).isEqualTo(1)
        assertThat(selectPreferredOfferIndex(listOf(false, false))).isEqualTo(0)
        assertThat(selectPreferredOfferIndex(emptyList())).isEqualTo(-1)
    }

    @Test
    fun `display price skips free trial phase and uses the first paid phase`() {
        val result =
            resolveDisplayPricing(
                listOf(
                    PricingPhaseSummary(priceAmountMicros = 0L, formattedPrice = "Free", billingPeriod = "P7D"),
                    PricingPhaseSummary(priceAmountMicros = 89_000_000L, formattedPrice = "TRY 89.00", billingPeriod = "P1M"),
                ),
            )

        assertThat(result?.priceAmountMicros).isEqualTo(89_000_000L)
        assertThat(result?.formattedPrice).isEqualTo("TRY 89.00")
        assertThat(result?.billingPeriod).isEqualTo("P1M")
    }

    @Test
    fun `trial metadata is derived only from zero-priced phases`() {
        assertThat(
            extractTrialDays(
                listOf(
                    PricingPhaseSummary(priceAmountMicros = 0L, formattedPrice = "Free", billingPeriod = "P3D"),
                    PricingPhaseSummary(priceAmountMicros = 89_000_000L, formattedPrice = "TRY 89.00", billingPeriod = "P1M"),
                ),
            ),
        ).isEqualTo(3)
        assertThat(
            extractTrialDays(
                listOf(
                    PricingPhaseSummary(priceAmountMicros = 89_000_000L, formattedPrice = "TRY 89.00", billingPeriod = "P1M"),
                ),
            ),
        ).isNull()
    }

    @Test
    fun `yearly savings percentage is calculated from monthly and yearly price micros`() {
        assertThat(calculateYearlySavingsPercent(89_000_000L, 499_000_000L)).isEqualTo(53)
        assertThat(calculateYearlySavingsPercent(0L, 499_000_000L)).isEqualTo(0)
    }
}
