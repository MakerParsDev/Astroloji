package com.parsfilo.astrology.notification

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class EventSyncPolicyTest {
    @Test
    fun `classifies successful responses as delivered`() {
        assertThat(classifyAnalyticsResponse(200)).isEqualTo(AnalyticsDeliveryDisposition.DELIVERED)
        assertThat(classifyAnalyticsResponse(204)).isEqualTo(AnalyticsDeliveryDisposition.DELIVERED)
    }

    @Test
    fun `classifies permanent client failures for deletion`() {
        assertThat(classifyAnalyticsResponse(400)).isEqualTo(AnalyticsDeliveryDisposition.PERMANENT_FAILURE)
        assertThat(classifyAnalyticsResponse(401)).isEqualTo(AnalyticsDeliveryDisposition.PERMANENT_FAILURE)
        assertThat(classifyAnalyticsResponse(422)).isEqualTo(AnalyticsDeliveryDisposition.PERMANENT_FAILURE)
    }

    @Test
    fun `classifies timeout rate limit and server failures for retry`() {
        assertThat(classifyAnalyticsResponse(408)).isEqualTo(AnalyticsDeliveryDisposition.RETRY)
        assertThat(classifyAnalyticsResponse(429)).isEqualTo(AnalyticsDeliveryDisposition.RETRY)
        assertThat(classifyAnalyticsResponse(500)).isEqualTo(AnalyticsDeliveryDisposition.RETRY)
        assertThat(classifyAnalyticsResponse(503)).isEqualTo(AnalyticsDeliveryDisposition.RETRY)
    }
}
