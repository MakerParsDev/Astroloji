package com.parsfilo.astrology.notification

enum class AnalyticsDeliveryDisposition {
    DELIVERED,
    PERMANENT_FAILURE,
    RETRY,
}

fun classifyAnalyticsResponse(statusCode: Int): AnalyticsDeliveryDisposition =
    when {
        statusCode in 200..299 -> AnalyticsDeliveryDisposition.DELIVERED
        statusCode == 408 || statusCode == 429 || statusCode >= 500 -> AnalyticsDeliveryDisposition.RETRY
        else -> AnalyticsDeliveryDisposition.PERMANENT_FAILURE
    }
