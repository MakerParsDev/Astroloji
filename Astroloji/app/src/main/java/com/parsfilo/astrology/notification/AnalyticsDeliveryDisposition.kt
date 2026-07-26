package com.parsfilo.astrology.notification

private const val HTTP_SUCCESS_MIN = 200
private const val HTTP_SUCCESS_MAX = 299
private const val HTTP_REQUEST_TIMEOUT = 408
private const val HTTP_TOO_MANY_REQUESTS = 429
private const val HTTP_SERVER_ERROR_MIN = 500

enum class AnalyticsDeliveryDisposition {
    DELIVERED,
    PERMANENT_FAILURE,
    RETRY,
}

fun classifyAnalyticsResponse(statusCode: Int): AnalyticsDeliveryDisposition =
    when {
        statusCode in HTTP_SUCCESS_MIN..HTTP_SUCCESS_MAX -> AnalyticsDeliveryDisposition.DELIVERED
        statusCode == HTTP_REQUEST_TIMEOUT ||
            statusCode == HTTP_TOO_MANY_REQUESTS ||
            statusCode >= HTTP_SERVER_ERROR_MIN -> AnalyticsDeliveryDisposition.RETRY
        else -> AnalyticsDeliveryDisposition.PERMANENT_FAILURE
    }
