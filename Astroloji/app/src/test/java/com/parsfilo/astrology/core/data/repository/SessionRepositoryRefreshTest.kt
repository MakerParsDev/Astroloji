package com.parsfilo.astrology.core.data.repository

import com.google.android.gms.tasks.Tasks
import com.google.common.truth.Truth.assertThat
import com.google.firebase.auth.AuthResult
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GetTokenResult
import com.parsfilo.astrology.core.data.local.AstrologyDatabase
import com.parsfilo.astrology.core.data.local.UserProfileDao
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.push.PushRegistrationManager
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.RegisterUserRequest
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
import io.mockk.runs
import io.mockk.slot
import io.mockk.verify
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.util.Base64

@OptIn(ExperimentalCoroutinesApi::class)
class SessionRepositoryRefreshTest {
    private val firebaseAuth = mockk<FirebaseAuth>()
    private val firebaseUser = mockk<FirebaseUser>()
    private val tokenResult = mockk<GetTokenResult>()
    private val pushRegistrationManager = mockk<PushRegistrationManager>()
    private val api = mockk<AstrologyApi>()
    private val preferencesRepository = mockk<UserPreferencesRepository>(relaxed = true)
    private val userProfileDao = mockk<UserProfileDao>()
    private val database = mockk<AstrologyDatabase>()
    private val stringsProvider = mockk<StringsProvider>(relaxed = true)
    private val tokenStore = SessionTokenStore()

    @Before
    fun setUp() {
        coEvery { pushRegistrationManager.register() } returns "fid-123"
        every { database.userProfileDao() } returns userProfileDao
    }

    @Test
    fun `missing FID does not generate a placeholder during registration`() =
        runTest {
            val fresh = jwt(exp = 4_000_000_100)
            val registerRequest = slot<RegisterUserRequest>()
            coEvery { preferencesRepository.current() } returns UserPreferences()
            every { firebaseAuth.currentUser } returns firebaseUser
            every { tokenResult.token } returns "firebase-token"
            every { firebaseUser.getIdToken(true) } returns Tasks.forResult(tokenResult)
            coEvery { pushRegistrationManager.register() } throws IOException("FID unavailable")
            coEvery { api.registerUser(any(), capture(registerRequest)) } returns
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

            val result = repository.refreshSessionToken(forceRefreshFirebaseToken = true)

            assertThat(result).isEqualTo(AppResult.Success(fresh))
            assertThat(registerRequest.captured.firebaseInstallationId).isNull()
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
    fun `missing Firebase user recovers through anonymous authentication without password APIs`() =
        runTest {
            val fresh = jwt(exp = 4_000_000_100)
            val authResult = mockk<AuthResult>()
            coEvery { preferencesRepository.current() } returns UserPreferences()
            every { firebaseAuth.currentUser } returns null
            every { firebaseAuth.signInAnonymously() } returns Tasks.forResult(authResult)
            every { authResult.user } returns firebaseUser
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

            val result = repository.refreshSessionToken(forceRefreshFirebaseToken = true)

            assertThat(result).isEqualTo(AppResult.Success(fresh))
            verify(exactly = 1) { firebaseAuth.signInAnonymously() }
            verify(exactly = 0) { firebaseAuth.signInWithEmailAndPassword(any(), any()) }
            verify(exactly = 0) { firebaseAuth.createUserWithEmailAndPassword(any(), any()) }
        }

    @Test
    fun `disabled anonymous authentication fails without password fallback`() =
        runTest {
            val fallbackAuthResult = mockk<AuthResult>()
            coEvery { preferencesRepository.current() } returns UserPreferences()
            every { firebaseAuth.currentUser } returns null
            every { firebaseAuth.signInAnonymously() } returns
                Tasks.forException(IOException("Anonymous authentication unavailable."))
            every { firebaseAuth.signInWithEmailAndPassword(any(), any()) } returns Tasks.forResult(fallbackAuthResult)
            every { fallbackAuthResult.user } returns firebaseUser
            every { tokenResult.token } returns "firebase-token"
            every { firebaseUser.getIdToken(true) } returns Tasks.forResult(tokenResult)
            coEvery { api.registerUser(any(), any()) } returns
                retrofit2.Response.success(
                    RegisterUserResponse(
                        userId = "user-1",
                        jwt = jwt(exp = 4_000_000_100),
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

            val result = repository.refreshSessionToken(forceRefreshFirebaseToken = true)

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            verify(exactly = 1) { firebaseAuth.signInAnonymously() }
            verify(exactly = 0) { firebaseAuth.signInWithEmailAndPassword(any(), any()) }
            verify(exactly = 0) { firebaseAuth.createUserWithEmailAndPassword(any(), any()) }
            coVerify(exactly = 0) { api.registerUser(any(), any()) }
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

    @Test
    fun `invalidateSession clears all local session material`() =
        runTest {
            tokenStore.update(jwt(exp = 4_000_000_000))
            coJustRun { preferencesRepository.clearSession() }
            coJustRun { userProfileDao.clear() }
            every { firebaseAuth.signOut() } just runs
            val repository = createRepository()

            repository.invalidateSession()

            assertThat(tokenStore.current()).isNull()
            coVerify(exactly = 1) { preferencesRepository.clearSession() }
            coVerify(exactly = 1) { userProfileDao.clear() }
            verify(exactly = 1) { firebaseAuth.signOut() }
        }

    @Test
    fun `forced recovery propagates cancellation without clearing session state`() =
        runTest {
            val stale = jwt(exp = 4_000_000_000)
            tokenStore.update(stale)
            coEvery { preferencesRepository.current() } returns UserPreferences(jwt = stale)
            coJustRun { preferencesRepository.clearSession() }
            coJustRun { userProfileDao.clear() }
            every { firebaseAuth.currentUser } returns firebaseUser
            every { firebaseUser.getIdToken(true) } returns
                Tasks.forException(CancellationException("cancelled"))
            every { firebaseAuth.signOut() } just runs
            val repository = createRepository()
            var cancellation: CancellationException? = null

            try {
                repository.refreshAfterUnauthorized(stale)
            } catch (exception: CancellationException) {
                cancellation = exception
            }

            assertThat(cancellation).isNotNull()
            assertThat(tokenStore.current()).isEqualTo(stale)
            coVerify(exactly = 0) { preferencesRepository.clearSession() }
            coVerify(exactly = 0) { userProfileDao.clear() }
            verify(exactly = 0) { firebaseAuth.signOut() }
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
            pushRegistrationManager = pushRegistrationManager,
        )

    private fun jwt(exp: Long): String {
        val payload = Base64.getUrlEncoder().withoutPadding().encodeToString("""{"exp":$exp}""".toByteArray())
        return "header.$payload.signature"
    }
}
