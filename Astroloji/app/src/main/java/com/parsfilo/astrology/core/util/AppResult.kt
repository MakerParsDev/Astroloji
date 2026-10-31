package com.parsfilo.astrology.core.util

sealed class AppResult<out T> {
    data class Success<T>(
        val data: T,
    ) : AppResult<T>()

    data class Error(
        val exception: AppException,
    ) : AppResult<Nothing>()

    data object Loading : AppResult<Nothing>()
}

enum class BillingFailureReason(
    val analyticsValue: String,
) {
    USER_CANCELLED("user_cancelled"),
    NETWORK_ERROR("network_error"),
    SERVICE_DISCONNECTED("service_disconnected"),
    SERVICE_UNAVAILABLE("service_unavailable"),
    BILLING_UNAVAILABLE("billing_unavailable"),
    ITEM_UNAVAILABLE("item_unavailable"),
    ITEM_ALREADY_OWNED("item_already_owned"),
    ITEM_NOT_OWNED("item_not_owned"),
    FEATURE_NOT_SUPPORTED("feature_not_supported"),
    DEVELOPER_ERROR("developer_error"),
    BILLING_ERROR("billing_error"),
    UNKNOWN("unknown"),
}

sealed class AppException(
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause) {
    class NetworkException(
        message: String = "Network connection could not be established.",
        cause: Throwable? = null,
    ) : AppException(message, cause)

    class RewardChallengeExpiredException : AppException("Reward verification expired. Please try again.")

    class UnauthorizedException : AppException("Your session has expired.")

    class NotFoundException(
        message: String,
    ) : AppException(message)

    class PremiumRequiredException : AppException("This content requires premium access.")

    class BillingException(
        message: String,
        val reason: BillingFailureReason = BillingFailureReason.UNKNOWN,
    ) : AppException(message)

    class ValidationException(
        message: String,
    ) : AppException(message)

    class UnknownException(
        message: String,
        cause: Throwable? = null,
    ) : AppException(message, cause)
}

inline fun <T, R> AppResult<T>.map(transform: (T) -> R): AppResult<R> =
    when (this) {
        is AppResult.Success -> AppResult.Success(transform(data))
        is AppResult.Error -> this
        AppResult.Loading -> AppResult.Loading
    }
