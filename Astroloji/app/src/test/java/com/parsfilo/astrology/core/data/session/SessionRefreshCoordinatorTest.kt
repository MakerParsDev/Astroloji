package com.parsfilo.astrology.core.data.session

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SessionRefreshCoordinatorTest {
    @Test
    fun `non forced refresh returns current token without refreshing`() =
        runTest {
            val tokenStore = SessionTokenStore().apply { update("current-token") }
            val coordinator = SessionRefreshCoordinator()
            var refreshCalls = 0

            val result =
                coordinator.refresh(
                    rejectedToken = null,
                    requireRefresh = false,
                    currentToken = tokenStore::current,
                ) {
                    refreshCalls += 1
                    AppResult.Success("new-token")
                }

            assertThat(result).isEqualTo(AppResult.Success("current-token"))
            assertThat(refreshCalls).isEqualTo(0)
        }

    @Test
    fun `forced refresh runs when current token matches rejected token`() =
        runTest {
            val tokenStore = SessionTokenStore().apply { update("rejected-token") }
            val coordinator = SessionRefreshCoordinator()
            var refreshCalls = 0

            val result =
                coordinator.refresh(
                    rejectedToken = "rejected-token",
                    requireRefresh = true,
                    currentToken = tokenStore::current,
                ) {
                    refreshCalls += 1
                    tokenStore.update("fresh-token")
                    AppResult.Success("fresh-token")
                }

            assertThat(result).isEqualTo(AppResult.Success("fresh-token"))
            assertThat(refreshCalls).isEqualTo(1)
        }

    @Test
    fun `concurrent forced refreshes for same token refresh once`() =
        runTest(UnconfinedTestDispatcher()) {
            val tokenStore = SessionTokenStore().apply { update("rejected-token") }
            val coordinator = SessionRefreshCoordinator()
            val refreshStarted = CompletableDeferred<Unit>()
            val allowRefresh = CompletableDeferred<Unit>()
            var refreshCalls = 0
            val refresh: suspend () -> AppResult<String> = {
                refreshCalls += 1
                refreshStarted.complete(Unit)
                allowRefresh.await()
                tokenStore.update("fresh-token")
                AppResult.Success("fresh-token")
            }

            val first =
                async {
                    coordinator.refresh(
                        rejectedToken = "rejected-token",
                        requireRefresh = true,
                        currentToken = tokenStore::current,
                        refresh = refresh,
                    )
                }
            refreshStarted.await()
            val second =
                async {
                    coordinator.refresh(
                        rejectedToken = "rejected-token",
                        requireRefresh = true,
                        currentToken = tokenStore::current,
                        refresh = refresh,
                    )
                }

            allowRefresh.complete(Unit)

            assertThat(first.await()).isEqualTo(AppResult.Success("fresh-token"))
            assertThat(second.await()).isEqualTo(AppResult.Success("fresh-token"))
            assertThat(refreshCalls).isEqualTo(1)
        }

    @Test
    fun `forced refresh rejects unchanged token`() =
        runTest {
            val tokenStore = SessionTokenStore().apply { update("rejected-token") }
            val coordinator = SessionRefreshCoordinator()

            val result =
                coordinator.refresh(
                    rejectedToken = "rejected-token",
                    requireRefresh = true,
                    currentToken = tokenStore::current,
                ) {
                    AppResult.Success("rejected-token")
                }

            assertThat((result as AppResult.Error).exception)
                .isInstanceOf(AppException.UnauthorizedException::class.java)
        }

    @Test
    fun `concurrent forced refresh failures are shared`() =
        runTest(UnconfinedTestDispatcher()) {
            val tokenStore = SessionTokenStore().apply { update("rejected-token") }
            val coordinator = SessionRefreshCoordinator()
            val refreshStarted = CompletableDeferred<Unit>()
            val allowRefresh = CompletableDeferred<Unit>()
            var refreshCalls = 0
            val refresh: suspend () -> AppResult<String> = {
                refreshCalls += 1
                refreshStarted.complete(Unit)
                allowRefresh.await()
                tokenStore.update(null)
                AppResult.Error(AppException.UnauthorizedException())
            }

            val first =
                async {
                    coordinator.refresh(
                        rejectedToken = "rejected-token",
                        requireRefresh = true,
                        currentToken = tokenStore::current,
                        refresh = refresh,
                    )
                }
            refreshStarted.await()
            val second =
                async {
                    coordinator.refresh(
                        rejectedToken = "rejected-token",
                        requireRefresh = true,
                        currentToken = tokenStore::current,
                        refresh = refresh,
                    )
                }

            allowRefresh.complete(Unit)

            assertThat((first.await() as AppResult.Error).exception)
                .isInstanceOf(AppException.UnauthorizedException::class.java)
            assertThat((second.await() as AppResult.Error).exception)
                .isInstanceOf(AppException.UnauthorizedException::class.java)
            assertThat(refreshCalls).isEqualTo(1)
        }

    @Test
    fun `concurrent refresh callback exceptions are shared as an error result`() =
        runTest(UnconfinedTestDispatcher()) {
            val tokenStore = SessionTokenStore().apply { update("rejected-token") }
            val coordinator = SessionRefreshCoordinator()
            val refreshStarted = CompletableDeferred<Unit>()
            val allowFailure = CompletableDeferred<Unit>()
            var refreshCalls = 0
            val refresh: suspend () -> AppResult<String> = {
                refreshCalls += 1
                refreshStarted.complete(Unit)
                allowFailure.await()
                error("refresh failed")
            }

            val first =
                async {
                    coordinator.refresh(
                        rejectedToken = "rejected-token",
                        requireRefresh = true,
                        currentToken = tokenStore::current,
                        refresh = refresh,
                    )
                }
            refreshStarted.await()
            val second =
                async {
                    coordinator.refresh(
                        rejectedToken = "rejected-token",
                        requireRefresh = true,
                        currentToken = tokenStore::current,
                        refresh = refresh,
                    )
                }

            allowFailure.complete(Unit)

            assertThat((first.await() as AppResult.Error).exception)
                .isInstanceOf(AppException.UnknownException::class.java)
            assertThat((second.await() as AppResult.Error).exception)
                .isInstanceOf(AppException.UnknownException::class.java)
            assertThat(refreshCalls).isEqualTo(1)
        }

    @Test
    fun `cancelling initiating caller keeps shared refresh alive for another waiter`() =
        runTest(UnconfinedTestDispatcher()) {
            val tokenStore = SessionTokenStore().apply { update("rejected-token") }
            val coordinator = SessionRefreshCoordinator()
            val refreshStarted = CompletableDeferred<Unit>()
            val allowRefresh = CompletableDeferred<Unit>()
            var refreshCalls = 0
            val refresh: suspend () -> AppResult<String> = {
                refreshCalls += 1
                refreshStarted.complete(Unit)
                allowRefresh.await()
                tokenStore.update("fresh-token")
                AppResult.Success("fresh-token")
            }

            val first =
                launch(start = CoroutineStart.UNDISPATCHED) {
                    coordinator.refresh(
                        rejectedToken = "rejected-token",
                        requireRefresh = true,
                        currentToken = tokenStore::current,
                        refresh = refresh,
                    )
                }
            refreshStarted.await()
            val second =
                async(start = CoroutineStart.UNDISPATCHED) {
                    coordinator.refresh(
                        rejectedToken = "rejected-token",
                        requireRefresh = true,
                        currentToken = tokenStore::current,
                        refresh = refresh,
                    )
                }

            first.cancelAndJoin()
            allowRefresh.complete(Unit)

            assertThat(second.await()).isEqualTo(AppResult.Success("fresh-token"))
            assertThat(refreshCalls).isEqualTo(1)
        }

    @Test
    fun `failed refresh can be retried after the concurrent attempt completes`() =
        runTest {
            val tokenStore = SessionTokenStore().apply { update("rejected-token") }
            val coordinator = SessionRefreshCoordinator()
            var refreshCalls = 0

            val first =
                coordinator.refresh(
                    rejectedToken = "rejected-token",
                    requireRefresh = true,
                    currentToken = tokenStore::current,
                ) {
                    refreshCalls += 1
                    tokenStore.update(null)
                    AppResult.Error(AppException.UnauthorizedException())
                }

            val second =
                coordinator.refresh(
                    rejectedToken = "rejected-token",
                    requireRefresh = true,
                    currentToken = tokenStore::current,
                ) {
                    refreshCalls += 1
                    tokenStore.update("fresh-token")
                    AppResult.Success("fresh-token")
                }

            assertThat((first as AppResult.Error).exception)
                .isInstanceOf(AppException.UnauthorizedException::class.java)
            assertThat(second).isEqualTo(AppResult.Success("fresh-token"))
            assertThat(refreshCalls).isEqualTo(2)
        }

    @Test
    fun `different rejected token waits for active refresh then starts a new refresh`() =
        runTest(UnconfinedTestDispatcher()) {
            val tokenStore = SessionTokenStore().apply { update("first-rejected-token") }
            val coordinator = SessionRefreshCoordinator()
            val firstTokenPublished = CompletableDeferred<Unit>()
            val allowFirstRefreshToFinish = CompletableDeferred<Unit>()
            var refreshCalls = 0

            val first =
                async {
                    coordinator.refresh(
                        rejectedToken = "first-rejected-token",
                        requireRefresh = true,
                        currentToken = tokenStore::current,
                    ) {
                        refreshCalls += 1
                        tokenStore.update("second-rejected-token")
                        firstTokenPublished.complete(Unit)
                        allowFirstRefreshToFinish.await()
                        AppResult.Success("second-rejected-token")
                    }
                }

            firstTokenPublished.await()
            val second =
                async {
                    coordinator.refresh(
                        rejectedToken = "second-rejected-token",
                        requireRefresh = true,
                        currentToken = tokenStore::current,
                    ) {
                        refreshCalls += 1
                        tokenStore.update("fresh-token")
                        AppResult.Success("fresh-token")
                    }
                }

            allowFirstRefreshToFinish.complete(Unit)

            assertThat(first.await()).isEqualTo(AppResult.Success("second-rejected-token"))
            assertThat(second.await()).isEqualTo(AppResult.Success("fresh-token"))
            assertThat(refreshCalls).isEqualTo(2)
        }

    @Test
    fun `forced refresh reuses token already replaced by another request`() =
        runTest {
            val tokenStore = SessionTokenStore().apply { update("fresh-token") }
            val coordinator = SessionRefreshCoordinator()
            var refreshCalls = 0

            val result =
                coordinator.refresh(
                    rejectedToken = "rejected-token",
                    requireRefresh = true,
                    currentToken = tokenStore::current,
                ) {
                    refreshCalls += 1
                    AppResult.Success("unexpected-token")
                }

            assertThat(result).isEqualTo(AppResult.Success("fresh-token"))
            assertThat(refreshCalls).isEqualTo(0)
        }
}
