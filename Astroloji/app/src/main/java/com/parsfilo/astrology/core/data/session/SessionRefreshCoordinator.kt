package com.parsfilo.astrology.core.data.session

import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SessionRefreshCoordinator
    @Inject
    constructor() {
        private val mutex = Mutex()
        private var inFlight: CompletableDeferred<AppResult<String>>? = null

        suspend fun refresh(
            rejectedToken: String?,
            requireRefresh: Boolean,
            currentToken: () -> String?,
            refresh: suspend () -> AppResult<String>,
        ): AppResult<String> {
            val action =
                mutex.withLock {
                    val current = currentToken()?.takeIf { it.isNotBlank() }
                    when {
                        !requireRefresh && current != null ->
                            RefreshAction.Immediate(AppResult.Success(current))
                        hasNewerToken(rejectedToken, current) ->
                            RefreshAction.Immediate(AppResult.Success(current))
                        inFlight != null ->
                            RefreshAction.Await(checkNotNull(inFlight))
                        else -> {
                            val deferred = CompletableDeferred<AppResult<String>>()
                            inFlight = deferred
                            RefreshAction.Execute(deferred)
                        }
                    }
                }

            return when (action) {
                is RefreshAction.Immediate -> action.result
                is RefreshAction.Await ->
                    validateRefreshResult(
                        rejectedToken = rejectedToken,
                        requireRefresh = requireRefresh,
                        result = action.deferred.await(),
                    )
                is RefreshAction.Execute ->
                    executeRefresh(
                        rejectedToken = rejectedToken,
                        requireRefresh = requireRefresh,
                        refresh = refresh,
                        deferred = action.deferred,
                    )
            }
        }

        private suspend fun executeRefresh(
            rejectedToken: String?,
            requireRefresh: Boolean,
            refresh: suspend () -> AppResult<String>,
            deferred: CompletableDeferred<AppResult<String>>,
        ): AppResult<String> =
            try {
                val result = validateRefreshResult(rejectedToken, requireRefresh, refresh())
                deferred.complete(result)
                result
            } finally {
                if (!deferred.isCompleted) {
                    deferred.cancel()
                }
                withContext(NonCancellable) {
                    mutex.withLock {
                        if (inFlight === deferred) {
                            inFlight = null
                        }
                    }
                }
            }

        private fun hasNewerToken(
            rejectedToken: String?,
            currentToken: String?,
        ): Boolean = rejectedToken != null && currentToken != null && currentToken != rejectedToken

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

        private sealed interface RefreshAction {
            data class Immediate(
                val result: AppResult<String>,
            ) : RefreshAction

            data class Await(
                val deferred: CompletableDeferred<AppResult<String>>,
            ) : RefreshAction

            data class Execute(
                val deferred: CompletableDeferred<AppResult<String>>,
            ) : RefreshAction
        }
    }
