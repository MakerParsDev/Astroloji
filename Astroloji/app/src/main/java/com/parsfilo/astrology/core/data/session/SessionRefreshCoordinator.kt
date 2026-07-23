package com.parsfilo.astrology.core.data.session

import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SessionRefreshCoordinator
    @Inject
    constructor() {
        private val mutex = Mutex()
        private var lastRejectedToken: String? = null
        private var lastRefreshResult: AppResult<String>? = null

        suspend fun refresh(
            rejectedToken: String?,
            requireRefresh: Boolean,
            currentToken: () -> String?,
            refresh: suspend () -> AppResult<String>,
        ): AppResult<String> =
            mutex.withLock {
                val current = currentToken()?.takeIf { it.isNotBlank() }
                if (!requireRefresh && current != null) {
                    return@withLock AppResult.Success(current)
                }
                if (hasNewerToken(rejectedToken, current)) {
                    return@withLock AppResult.Success(requireNotNull(current))
                }
                if (canReuseFailedRefresh(rejectedToken, current)) {
                    return@withLock lastRefreshResult
                        ?: performRefresh(rejectedToken, requireRefresh, refresh)
                }
                performRefresh(rejectedToken, requireRefresh, refresh)
            }

        private fun hasNewerToken(
            rejectedToken: String?,
            currentToken: String?,
        ): Boolean = rejectedToken != null && currentToken != null && currentToken != rejectedToken

        private fun canReuseFailedRefresh(
            rejectedToken: String?,
            currentToken: String?,
        ): Boolean = rejectedToken != null && currentToken == null && rejectedToken == lastRejectedToken

        private suspend fun performRefresh(
            rejectedToken: String?,
            requireRefresh: Boolean,
            refresh: suspend () -> AppResult<String>,
        ): AppResult<String> {
            val result = validateRefreshResult(rejectedToken, requireRefresh, refresh())
            if (rejectedToken != null) {
                lastRejectedToken = rejectedToken
                lastRefreshResult = result
            }
            return result
        }

        private fun validateRefreshResult(
            rejectedToken: String?,
            requireRefresh: Boolean,
            result: AppResult<String>,
        ): AppResult<String> =
            when (result) {
                is AppResult.Success ->
                    if (result.data.isBlank() || isRejectedTokenReused(result.data, rejectedToken, requireRefresh)) {
                        AppResult.Error(AppException.UnauthorizedException())
                    } else {
                        result
                    }
                is AppResult.Error -> result
                AppResult.Loading -> AppResult.Error(AppException.UnauthorizedException())
            }

        private fun isRejectedTokenReused(
            refreshedToken: String,
            rejectedToken: String?,
            requireRefresh: Boolean,
        ): Boolean = requireRefresh && rejectedToken != null && refreshedToken == rejectedToken
    }
