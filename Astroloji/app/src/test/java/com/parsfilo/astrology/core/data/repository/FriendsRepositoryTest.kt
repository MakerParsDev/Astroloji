package com.parsfilo.astrology.core.data.repository

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.remote.AcceptInviteResponse
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.FriendResponse
import com.parsfilo.astrology.core.data.remote.FriendsListResponse
import com.parsfilo.astrology.core.data.remote.InviteCodeResponse
import com.parsfilo.astrology.core.data.session.AuthenticatedRequestExecutor
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.DispatchersProvider
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class FriendsRepositoryTest {
    private val api = mockk<AstrologyApi>()
    private val sessionRepository = mockk<SessionRepository>()
    private val dispatcher = UnconfinedTestDispatcher()
    private val repository =
        FriendsRepository(
            api = api,
            sessionRepository = sessionRepository,
            requestExecutor = AuthenticatedRequestExecutor(),
            dispatchers =
                DispatchersProvider(
                    main = dispatcher,
                    io = dispatcher,
                    default = dispatcher,
                ),
        )

    @Test
    fun `creating an invite returns the code and expiry`() =
        runTest {
            coEvery { api.createFriendInvite() } returns
                Response.success(InviteCodeResponse(code = "ABCDEFGH", expiresAt = "2026-08-18T00:00:00.000Z"))

            val result = repository.createInvite()

            assertThat(result).isInstanceOf(AppResult.Success::class.java)
            assertThat((result as AppResult.Success).data.code).isEqualTo("ABCDEFGH")
        }

    @Test
    fun `accepting an invite returns the friend user id`() =
        runTest {
            coEvery { api.acceptFriendInvite(any()) } returns
                Response.success(AcceptInviteResponse(ok = true, duplicate = false, friendUserId = "user-1"))

            val result = repository.acceptInvite("ABCDEFGH")

            assertThat(result).isInstanceOf(AppResult.Success::class.java)
            assertThat((result as AppResult.Success).data.friendUserId).isEqualTo("user-1")
        }

    @Test
    fun `an already redeemed invite surfaces a network error with the server message`() =
        runTest {
            coEvery { api.acceptFriendInvite(any()) } returns
                Response.error(409, "Invite code was already redeemed.".toResponseBody())

            val result = repository.acceptInvite("ABCDEFGH")

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat((result as AppResult.Error).exception).isInstanceOf(AppException.NetworkException::class.java)
        }

    @Test
    fun `friend list unwraps the response envelope`() =
        runTest {
            coEvery { api.getFriends() } returns
                Response.success(FriendsListResponse(friends = listOf(FriendResponse("user-2", "leo", "tr"))))

            val result = repository.getFriends()

            assertThat(result).isInstanceOf(AppResult.Success::class.java)
            assertThat((result as AppResult.Success).data).containsExactly(FriendResponse("user-2", "leo", "tr"))
        }

    @Test
    fun `unauthorized responses surface as an unauthorized error`() =
        runTest {
            coEvery { api.getFriends() } returns Response.error(401, "unauthorized".toResponseBody())
            coEvery { sessionRepository.refreshAfterUnauthorized(null) } returns
                AppResult.Error(AppException.UnauthorizedException())

            val result = repository.getFriends()

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat((result as AppResult.Error).exception)
                .isInstanceOf(AppException.UnauthorizedException::class.java)
        }
}
