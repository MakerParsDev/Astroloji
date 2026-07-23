package com.parsfilo.astrology.core.data.repository

import com.google.android.gms.tasks.Tasks
import com.google.common.truth.Truth.assertThat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GetTokenResult
import com.google.firebase.messaging.FirebaseMessaging
import com.parsfilo.astrology.core.data.local.AstrologyDatabase
import com.parsfilo.astrology.core.data.local.UserProfileDao
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.RegisterUserResponse
import com.parsfilo.astrology.core.data.session.AuthenticatedRequestExecutor
import com.parsfilo.astrology.core.data.session.SessionRefreshCoordinator
import com.parsfilo.astrology.core.data.session.SessionTokenStore
import com.parsfilo.astrology.core.domain.model.UserPreferences
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.DispatchersProvider
import com.parsfilo.astrology.core.util.StringsProvider
import io.mockk.coEvery
import io.mockk.coJustRun
import io.mockk.coVerify
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.runs
import io.mockk.unmockkStatic
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.util.Base64

@OptIn(ExperimentalCoroutinesApi::class)
class SessionRepositoryRefreshTest {
    private val firebaseAuth = mockk<FirebaseAuth>()
    private val firebaseUser = mockk<FirebaseUser>()
    private val tokenResult = mockk<GetTokenResult>()
    private val messaging = mockk<FirebaseMessaging>()
    private val api = mockk<AstrologyApi>()
    private val preferencesRepository = mockk<UserPreferencesRepository>()
    private val userProfileDao = mockk<UserProfileDao>()
    private val database = mockk<AstrologyDatabase>()
    private val stringsProvider = mockk<StringsProvider>(relaxed = true)
    private val tokenStore = SessionTokenStore()

    @Before
    fun setUp() {
        mockkStatic(FirebaseMessaging::class)
        every { FirebaseMessaging.getInstance() } returns messaging
        every { messaging.token } returns Tasks.forResult("fcm-token")
        every { database.userProfileDao() } returns userProfileDao
    }

    @After
    fun tearDown() {
        unmockkStatic(FirebaseMessaging::class)
    }

    @Test
    fun `forced recovery persists and publishes a fresh token`() =
        runTest {
            val stale = jwt(exp = 4_000_000_000)
            val fresh = jwt(exp = 4_000_000_100)
            tokenStore.update(stale)
            coEvery { preferencesRepository.current() } returns UserPreferences(jwt = stale)
            coJustRun { preferencesRepository.clearJwt() }
            every { firebaseAuth.currentUser } returns firebaseUser
            every { tokenResult.token } returns "firebase-token"
            every { firebaseUser.getIdToken(true) } returns Tasks.forResult(tokenResult)
            coEvery { api.registerUser(any(), any()) } returns
                retrofit2.Response.success(
                    RegisterUserResponse(
                        userId = "user-1",
                        jwt = fresh,
                        isPremium = false,
                    ),
                )
            coJustRun {
                preferencesRepository.updateSession(
                    any(),
                    any(),
                    any(),
                    any(),
                    any(),
                    any(),
                    any(),
                    any(),
                    any(),
                    any(),
                )
            }
            coJustRun { userProfileDao.upsert(any()) }
            val repository = createRepository()

            val result = repository.refreshAfterUnauthorized(stale)

            assertThat(result).isEqualTo(AppResult.Success(fresh))
            assertThat(tokenStore.current()).isEqualTo(fresh)
            coVerify(exactly = 1) { api.registerUser("Bearer firebase-token", any()) }
            verify(exactly = 0) { firebaseAuth.signOut() }
        }

    @Test
    fun `failed forced recovery clears invalid session state`() =
        runTest {
            val stale = jwt(exp = 4_000_000_000)
            tokenStore.update(stale)
            coEvery { preferencesRepository.current() } returns UserPreferences(jwt = stale)
            coJustRun { preferencesRepository.clearJwt() }
            coJustRun { preferencesRepository.clearSession() }
            coJustRun { userProfileDao.clear() }
            every { firebaseAuth.currentUser } returns firebaseUser
            every { firebaseUser.getIdToken(true) } returns Tasks.forException(IOException("token refresh failed"))
            every { firebaseAuth.signOut() } just runs
            val repository = createRepository()

            val result = repository.refreshAfterUnauthorized(stale)

            assertThat((result as AppResult.Error).exception)
                .isInstanceOf(AppException.UnauthorizedException::class.java)
            assertThat(tokenStore.current()).isNull()
            coVerify(exactly = 1) { preferencesRepository.clearSession() }
            coVerify(exactly = 1) { userProfileDao.clear() }
            verify(exactly = 1) { firebaseAuth.signOut() }
            coVerify(exactly = 0) { api.registerUser(any(), any()) }
        }

    private fun createRepository(): SessionRepository =
        SessionRepository(
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

    private fun jwt(exp: Long): String {
        val payload = Base64.getUrlEncoder().withoutPadding().encodeToString("""{"exp":$exp}""".toByteArray())
        return "header.$payload.signature"
    }
}
