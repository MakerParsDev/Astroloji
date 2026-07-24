package com.parsfilo.astrology.core.data.repository

import com.google.common.truth.Truth.assertThat
import com.google.firebase.auth.FirebaseAuth
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.data.local.AstrologyDatabase
import com.parsfilo.astrology.core.data.local.UserProfileDao
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
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
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.Response
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class SessionRepositoryDeletionTest {
    private val firebaseAuth = mockk<FirebaseAuth>(relaxed = true)
    private val api = mockk<AstrologyApi>()
    private val preferencesRepository = mockk<UserPreferencesRepository>()
    private val userProfileDao = mockk<UserProfileDao>()
    private val database = mockk<AstrologyDatabase>()
    private val stringsProvider = mockk<StringsProvider>()
    private val tokenStore = SessionTokenStore()

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
            tokenStore.update("app-jwt")
            val repository = createRepository()

            val result = repository.deleteAccount()

            assertThat(result).isEqualTo(AppResult.Success(Unit))
            coVerify(exactly = 1) { api.deleteUser() }
            verify(exactly = 1) { firebaseAuth.signOut() }
            verify(exactly = 1) { database.clearAllTables() }
            coVerify(exactly = 1) { preferencesRepository.clearAll() }
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
            verify(exactly = 0) { firebaseAuth.signOut() }
            verify(exactly = 0) { database.clearAllTables() }
            coVerify(exactly = 0) { preferencesRepository.clearAll() }
            assertThat(tokenStore.current()).isEqualTo("app-jwt")
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
            verify(exactly = 0) { firebaseAuth.signOut() }
            verify(exactly = 0) { database.clearAllTables() }
            coVerify(exactly = 0) { preferencesRepository.clearAll() }
            assertThat(tokenStore.current()).isEqualTo("app-jwt")
        }

    private fun createRepository(): SessionRepository {
        every { database.userProfileDao() } returns userProfileDao
        return SessionRepository(
            firebaseAuth = firebaseAuth,
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
        )
    }
}
