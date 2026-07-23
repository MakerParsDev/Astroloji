package com.parsfilo.astrology.core.data.session

import com.parsfilo.astrology.core.util.AppResult
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthenticatedRequestExecutor
    @Inject
    constructor() {
        suspend fun <T> execute(
            request: suspend () -> Response<T>,
            refreshAfterUnauthorized: suspend (String?) -> AppResult<String>,
            onUnauthorizedAfterRetry: suspend () -> Unit = {},
        ): Response<T> {
            val firstResponse = request()
            if (firstResponse.code() != HTTP_UNAUTHORIZED) {
                return firstResponse
            }

            val rejectedToken = firstResponse.rejectedBearerToken()
            return when (refreshAfterUnauthorized(rejectedToken)) {
                is AppResult.Success -> {
                    firstResponse.errorBody()?.close()
                    request().also { retryResponse ->
                        if (retryResponse.code() == HTTP_UNAUTHORIZED) {
                            onUnauthorizedAfterRetry()
                        }
                    }
                }
                is AppResult.Error,
                AppResult.Loading,
                -> firstResponse
            }
        }

        private fun Response<*>.rejectedBearerToken(): String? {
            val authorization = raw().request.header(AUTHORIZATION_HEADER)
            val separator = authorization?.indexOf(' ') ?: INVALID_SEPARATOR
            val hasBearerScheme =
                separator > 0 &&
                    authorization
                        ?.substring(0, separator)
                        ?.equals(BEARER_SCHEME, ignoreCase = true) == true

            return if (hasBearerScheme) {
                authorization
                    ?.substring(separator + 1)
                    ?.trim()
                    ?.takeIf { it.isNotEmpty() }
            } else {
                null
            }
        }

        private companion object {
            const val HTTP_UNAUTHORIZED = 401
            const val INVALID_SEPARATOR = -1
            const val AUTHORIZATION_HEADER = "Authorization"
            const val BEARER_SCHEME = "Bearer"
        }
    }
