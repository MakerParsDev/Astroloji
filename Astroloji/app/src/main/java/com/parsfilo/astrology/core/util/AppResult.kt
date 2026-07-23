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

sealed class AppException(
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause) {
    class NetworkException(
        message: String = "Network connection could not be established.",
        cause: Throwable? = null,
    ) : AppException(message, cause)

    class UnauthorizedException : AppException("Your session has expired.")

    class NotFoundException : AppException("Content could not be found.")

    class PremiumRequiredException : AppException("This content requires premium access.")

    class BillingException(
        message: String,
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
