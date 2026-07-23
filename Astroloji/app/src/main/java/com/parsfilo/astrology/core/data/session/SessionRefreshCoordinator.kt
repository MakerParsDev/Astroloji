package com.parsfilo.astrology.core.data.session

import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import kotlinx.coroutines.CancellationException
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
        private var inFlight: ActiveRefresh? = null

        suspend fun refresh(
            rejectedToken: String?,
            requireRefresh: Boolean,
            currentToken: () -> String?,
            refresh: suspend () -> AppResult<String>,
        ): AppResult<String> {
            var resolved: AppResult<String>? = null
            while (resolved == null) {
                resolved =
                    when (
                        val action =
                            nextAction(
                                rejectedToken = rejectedToken,
                                requireRefresh = requireRefresh,
                                currentToken = currentToken,
                            )
                    ) {
                        is RefreshAction.Immediate -> action.result
                        is RefreshAction.AwaitMatching ->
                            validateRefreshResult(
                                rejectedToken = rejectedToken,
                                requireRefresh = requireRefresh,
                                result = action.deferred.await(),
                            )
                        is RefreshAction.AwaitThenRetry -> {
                            action.deferred.await()
                            null
                        }
                        is RefreshAction.Execute ->
                            executeRefresh(
                                rejectedToken = rejectedToken,
                                requireRefresh = requireRefresh,
                                refresh = refresh,
                                deferred = action.deferred,
                            )
                    }
            }
            return checkNotNull(resolved)
        }

        private suspend fun nextAction(
            rejectedToken: String?,
            requireRefresh: Boolean,
            currentToken: () -> String?,
        ): RefreshAction =
            mutex.withLock {
                val current = currentToken()?.takeIf { it.isNotBlank() }
                val newerToken = current?.takeIf { rejectedToken != null && it != rejectedToken }
                val active = inFlight
                when {
                    !requireRefresh && current != null ->
                        RefreshAction.Immediate(AppResult.Success(current))
                    newerToken != null ->
                        RefreshAction.Immediate(AppResult.Success(newerToken))
                    active == null -> {
                        val deferred = CompletableDeferred<AppResult<String>>()
                        inFlight = ActiveRefresh(rejectedToken = rejectedToken, deferred = deferred)
                        RefreshAction.Execute(deferred)
                    }
                    active.rejectedToken == rejectedToken ->
                        RefreshAction.AwaitMatching(active.deferred)
                    else ->
                        RefreshAction.AwaitThenRetry(active.deferred)
                }
            }

        private suspend fun executeRefresh(
            rejectedToken: String?,
            requireRefresh: Boolean,
            refresh: suspend () -> AppResult<String>,
            deferred: CompletableDeferred<AppResult<String>>,
        ): AppResult<String> {
            var result: AppResult<String>? = null
            try {
                val refreshResult =
                    runCatching { refresh() }.getOrElse { throwable ->
                        when (throwable) {
                            is CancellationException -> throw throwable
                            is Exception ->
                                AppResult.Error(
                                    AppException.UnknownException(
                                        message = "Session refresh failed.",
                                        cause = throwable,
                                    ),
                                )
                            else -> throw throwable
                        }
                    }
                val resolved = validateRefreshResult(rejectedToken, requireRefresh, refreshResult)
                result = resolved
                return resolved
            } finally {
                withContext(NonCancellable) {
                    mutex.withLock {
                        if (inFlight?.deferred === deferred) {
                            inFlight = null
                        }
                    }
                    result?.let { deferred.complete(it) } ?: deferred.cancel()
                }
            }
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

        private data class ActiveRefresh(
            val rejectedToken: String?,
            val deferred: CompletableDeferred<AppResult<String>>,
        )

        private sealed interface RefreshAction {
            data class Immediate(
                val result: AppResult<String>,
            ) : RefreshAction

            data class AwaitMatching(
                val deferred: CompletableDeferred<AppResult<String>>,
            ) : RefreshAction

            data class AwaitThenRetry(
                val deferred: CompletableDeferred<AppResult<String>>,
            ) : RefreshAction

            data class Execute(
                val deferred: CompletableDeferred<AppResult<String>>,
            ) : RefreshAction
        }
    }
