package com.parsfilo.astrology.core.data.repository

import com.google.common.truth.Truth.assertThat
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.auth.FirebaseAuth
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.data.local.AstrologyDatabase
import com.parsfilo.astrology.core.data.local.UserProfileDao
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.push.PushRegistrationManager
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.DeleteUserResponse
import com.parsfilo.astrology.core.data.session.AuthenticatedRequestExecutor
import com.parsfilo.astrology.core.data.session.SessionRefreshCoordinator
import com.parsfilo.astrology.core.data.session.SessionTokenStore
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.DispatchersProvider
import com.parsfilo.astrology.core.util.StringsProvider
import io.mockk.coEvery
import io.mockk.coJustRun
import io.mockk.coVerify
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.runs
import io.mockk.verify
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.Response
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class SessionRepositoryDeletionTest {
    private val firebaseAuth = mockk<FirebaseAuth>(relaxed = true)
    private val firebaseAnalytics = mockk<FirebaseAnalytics>(relaxed = true)
    private val api = mockk<AstrologyApi>()
    private val preferencesRepository = mockk<UserPreferencesRepository>()
    private val userProfileDao = mockk<UserProfileDao>()
    private val database = mockk<AstrologyDatabase>()
    private val stringsProvider = mockk<StringsProvider>()
    private val tokenStore = SessionTokenStore()
    private val syncGate = MoodAnalyticsSyncGate()
    private val pushRegistrationManager = mockk<PushRegistrationManager>()

    @Test
    fun `account deletion waits for in flight analytics before deleting the account`() =
        runTest {
            coEvery { api.deleteUser() } returns
                Response.success(DeleteUserResponse(ok = true, userId = "user-1", firebaseAccountDeleted = true))
            every { firebaseAuth.signOut() } just runs
            every { database.clearAllTables() } just runs
            coJustRun { preferencesRepository.clearAll() }
            coJustRun { pushRegistrationManager.unregister() }
            val repository = createRepository()
            val entered = CompletableDeferred<Unit>()
            val release = CompletableDeferred<Unit>()
            val inFlight =
                async {
                    syncGate.withLock {
                        entered.complete(Unit)
                        release.await()
                    }
                }
            entered.await()
            val deletion = async { repository.deleteAccount() }
            runCurrent()

            // A previously authorized network event could otherwise write to
            // user_events after the backend removed the account and its rows.
            coVerify(exactly = 0) { api.deleteUser() }
            release.complete(Unit)
            inFlight.await()
            assertThat(deletion.await()).isEqualTo(AppResult.Success(Unit))
            coVerify(exactly = 1) { api.deleteUser() }
        }

    @Test
    fun `account deletion blocks new analytics until local identity is cleared`() =
        runTest {
            val deletionEntered = CompletableDeferred<Unit>()
            val finishDeletion = CompletableDeferred<Unit>()
            coEvery { api.deleteUser() } coAnswers {
                deletionEntered.complete(Unit)
                finishDeletion.await()
                Response.success(DeleteUserResponse(ok = true, userId = "user-1", firebaseAccountDeleted = true))
            }
            every { firebaseAuth.signOut() } just runs
            every { database.clearAllTables() } just runs
            coJustRun { preferencesRepository.clearAll() }
            coJustRun { pushRegistrationManager.unregister() }
            val repository = createRepository()
            val deletion = async { repository.deleteAccount() }
            deletionEntered.await()
            var analyticsStarted = false
            val analytics =
                async {
                    syncGate.withLock { analyticsStarted = true }
                }
            runCurrent()
            assertThat(analyticsStarted).isFalse()

            finishDeletion.complete(Unit)
            assertThat(deletion.await()).isEqualTo(AppResult.Success(Unit))
            analytics.await()
            assertThat(analyticsStarted).isTrue()
        }

    @Test
    fun `deleteAccount clears local state only after backend deletion succeeds`() =
        runTest {
            coEvery { api.deleteUser() } returns
                Response.success(
                    DeleteUserResponse(
                        ok = true,
                        userId = "user-1",
                        firebaseAccountDeleted = true,
                    ),
                )
            every { firebaseAuth.signOut() } just runs
            every { database.clearAllTables() } just runs
            coJustRun { preferencesRepository.clearAll() }
            coJustRun { pushRegistrationManager.unregister() }
            tokenStore.update("app-jwt")
            val repository = createRepository()

            val result = repository.deleteAccount()

            assertThat(result).isEqualTo(AppResult.Success(Unit))
            coVerify(exactly = 1) { api.deleteUser() }
            verify(exactly = 1) { firebaseAuth.signOut() }
            verify(exactly = 1) { firebaseAnalytics.resetAnalyticsData() }
            verify(exactly = 1) { database.clearAllTables() }
            coVerify(exactly = 1) { preferencesRepository.clearAll() }
            coVerify(exactly = 1) { pushRegistrationManager.unregister() }
            assertThat(tokenStore.current()).isNull()
        }

    @Test
    fun `deleteAccount returns an error and preserves local state when network throws`() =
        runTest {
            every { stringsProvider.get(R.string.session_error_account_delete_failed) } returns
                "Account deletion failed."
            coEvery { api.deleteUser() } throws IOException("offline")
            tokenStore.update("app-jwt")
            val repository = createRepository()

            val result = repository.deleteAccount()

            assertThat((result as AppResult.Error).exception.message).isEqualTo("Account deletion failed.")
            assertFailedDeletionPreservesLocalState()
        }

    @Test
    fun `deleteAccount preserves local state when backend deletion fails`() =
        runTest {
            every { stringsProvider.get(R.string.session_error_account_delete_failed) } returns
                "Account deletion failed."
            coEvery { api.deleteUser() } returns
                Response.error(
                    502,
                    "{}".toResponseBody("application/json".toMediaType()),
                )
            tokenStore.update("app-jwt")
            val repository = createRepository()

            val result = repository.deleteAccount()

            assertThat((result as AppResult.Error).exception.message).isEqualTo("Account deletion failed.")
            assertFailedDeletionPreservesLocalState()
        }

    @Test
    fun `account deletion still clears login data if Analytics reset throws`() =
        runTest {
            coEvery { api.deleteUser() } returns
                Response.success(DeleteUserResponse(ok = true, userId = "user-1", firebaseAccountDeleted = true))
            every { firebaseAnalytics.resetAnalyticsData() } throws IllegalStateException("SDK unavailable")
            every { firebaseAuth.signOut() } just runs
            every { database.clearAllTables() } just runs
            coJustRun { preferencesRepository.clearAll() }
            coJustRun { pushRegistrationManager.unregister() }
            tokenStore.update("app-jwt")
            val repository = createRepository()

            val result = repository.deleteAccount()

            assertThat(result).isEqualTo(AppResult.Success(Unit))
            verify(exactly = 1) { firebaseAnalytics.resetAnalyticsData() }
            verify(exactly = 1) { firebaseAuth.signOut() }
            verify(exactly = 1) { database.clearAllTables() }
            coVerify(exactly = 1) { preferencesRepository.clearAll() }
            assertThat(tokenStore.current()).isNull()
        }

    @Test
    fun `confirmed backend deletion still clears auth and preferences if local database fails`() =
        runTest {
            coEvery { api.deleteUser() } returns
                Response.success(DeleteUserResponse(ok = true, userId = "user-1", firebaseAccountDeleted = true))
            every {
                stringsProvider.get(R.string.session_error_account_delete_failed)
            } returns "Account deletion failed."
            every {
                stringsProvider.get(R.string.session_error_account_delete_local_cleanup_incomplete)
            } returns "Account deleted online; clear local app storage."
            every { firebaseAuth.signOut() } just runs
            every { database.clearAllTables() } throws IllegalStateException("local DB unavailable")
            coJustRun { preferencesRepository.clearAll() }
            coJustRun { pushRegistrationManager.unregister() }
            tokenStore.update("app-jwt")
            val repository = createRepository()

            val result = repository.deleteAccount()

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat((result as AppResult.Error).exception).isInstanceOf(
                com.parsfilo.astrology.core.util.AppException.LocalCleanupException::class.java,
            )
            assertThat(result.exception.message).isEqualTo("Account deleted online; clear local app storage.")
            coVerify(exactly = 1) { api.deleteUser() }
            verify(exactly = 1) { firebaseAuth.signOut() }
            verify(exactly = 1) { database.clearAllTables() }
            coVerify(exactly = 1) { preferencesRepository.clearAll() }
            verify(exactly = 1) { firebaseAnalytics.resetAnalyticsData() }
            assertThat(tokenStore.current()).isNull()
        }

    @Test
    fun `confirmed backend deletion still clears token and analytics if preferences fail`() =
        runTest {
            coEvery { api.deleteUser() } returns
                Response.success(DeleteUserResponse(ok = true, userId = "user-1", firebaseAccountDeleted = true))
            every {
                stringsProvider.get(R.string.session_error_account_delete_failed)
            } returns "Account deletion failed."
            every {
                stringsProvider.get(R.string.session_error_account_delete_local_cleanup_incomplete)
            } returns "Account deleted online; clear local app storage."
            every { firebaseAuth.signOut() } just runs
            every { database.clearAllTables() } just runs
            coEvery { preferencesRepository.clearAll() } throws IllegalStateException("preferences unavailable")
            coJustRun { pushRegistrationManager.unregister() }
            tokenStore.update("app-jwt")
            val repository = createRepository()

            val result = repository.deleteAccount()

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat((result as AppResult.Error).exception).isInstanceOf(
                com.parsfilo.astrology.core.util.AppException.LocalCleanupException::class.java,
            )
            assertThat(result.exception.message).isEqualTo("Account deleted online; clear local app storage.")
            coVerify(exactly = 1) { api.deleteUser() }
            verify(exactly = 1) { database.clearAllTables() }
            coVerify(exactly = 1) { preferencesRepository.clearAll() }
            verify(exactly = 1) { firebaseAnalytics.resetAnalyticsData() }
            assertThat(tokenStore.current()).isNull()
        }

    @Test
    fun `confirmed backend deletion still clears local data when Firebase sign-out fails`() =
        runTest {
            coEvery { api.deleteUser() } returns
                Response.success(DeleteUserResponse(ok = true, userId = "user-1", firebaseAccountDeleted = true))
            every {
                stringsProvider.get(R.string.session_error_account_delete_local_cleanup_incomplete)
            } returns "Account deleted online; clear local app storage."
            every { firebaseAuth.signOut() } throws IllegalStateException("Firebase sign-out unavailable")
            every { database.clearAllTables() } just runs
            coJustRun { preferencesRepository.clearAll() }
            coJustRun { pushRegistrationManager.unregister() }
            tokenStore.update("app-jwt")
            val repository = createRepository()

            val result = repository.deleteAccount()

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat((result as AppResult.Error).exception).isInstanceOf(
                com.parsfilo.astrology.core.util.AppException.LocalCleanupException::class.java,
            )
            verify(exactly = 1) { database.clearAllTables() }
            coVerify(exactly = 1) { preferencesRepository.clearAll() }
            verify(exactly = 1) { firebaseAnalytics.resetAnalyticsData() }
            assertThat(tokenStore.current()).isNull()
        }

    private fun assertFailedDeletionPreservesLocalState() {
        verify(exactly = 0) { firebaseAuth.signOut() }
        verify(exactly = 0) { firebaseAnalytics.resetAnalyticsData() }
        verify(exactly = 0) { database.clearAllTables() }
        coVerify(exactly = 0) { preferencesRepository.clearAll() }
        coVerify(exactly = 0) { pushRegistrationManager.unregister() }
        assertThat(tokenStore.current()).isEqualTo("app-jwt")
    }

    private fun createRepository(): SessionRepository {
        every { database.userProfileDao() } returns userProfileDao
        return SessionRepository(
            firebaseAuth = firebaseAuth,
            firebaseAnalytics = firebaseAnalytics,
            api = api,
            preferencesRepository = preferencesRepository,
            database = database,
            dispatchers =
                DispatchersProvider(
                    main = UnconfinedTestDispatcher(),
                    io = UnconfinedTestDispatcher(),
                    default = UnconfinedTestDispatcher(),
                ),
            stringsProvider = stringsProvider,
            tokenStore = tokenStore,
            refreshCoordinator = SessionRefreshCoordinator(),
            requestExecutor = AuthenticatedRequestExecutor(),
            pushRegistrationManager = pushRegistrationManager,
            syncGate = syncGate,
        )
    }
}
