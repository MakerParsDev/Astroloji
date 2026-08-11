package com.parsfilo.astrology.core.data.repository

import com.parsfilo.astrology.core.data.remote.AcceptInviteRequest
import com.parsfilo.astrology.core.data.remote.AcceptInviteResponse
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.FriendResponse
import com.parsfilo.astrology.core.data.remote.InviteCodeResponse
import com.parsfilo.astrology.core.data.session.AuthenticatedRequestExecutor
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.DispatchersProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import retrofit2.Response
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FriendsRepository
    @Inject
    constructor(
        private val api: AstrologyApi,
        private val sessionRepository: SessionRepository,
        private val requestExecutor: AuthenticatedRequestExecutor,
        private val dispatchers: DispatchersProvider,
    ) {
        suspend fun createInvite(): AppResult<InviteCodeResponse> =
            withContext(dispatchers.io) {
                runAuthenticated(
                    request = { api.createFriendInvite() },
                    emptyBodyMessage = "Invite code response was empty.",
                    failureMessage = "Invite code could not be created.",
                )
            }

        suspend fun acceptInvite(code: String): AppResult<AcceptInviteResponse> =
            withContext(dispatchers.io) {
                runAuthenticated(
                    request = { api.acceptFriendInvite(AcceptInviteRequest(code = code)) },
                    emptyBodyMessage = "Accept invite response was empty.",
                    failureMessage = "Invite code could not be accepted.",
                )
            }

        suspend fun getFriends(): AppResult<List<FriendResponse>> =
            withContext(dispatchers.io) {
                when (
                    val result =
                        runAuthenticated(
                            request = { api.getFriends() },
                            emptyBodyMessage = "Friends response was empty.",
                            failureMessage = "Friends could not be loaded.",
                        )
                ) {
                    is AppResult.Success -> AppResult.Success(result.data.friends)
                    is AppResult.Error -> result
                    AppResult.Loading -> AppResult.Loading
                }
            }

        suspend fun removeFriend(friendUserId: String): AppResult<Unit> =
            withContext(dispatchers.io) {
                when (
                    val result =
                        runAuthenticated(
                            request = { api.removeFriend(friendUserId) },
                            emptyBodyMessage = "Remove friend response was empty.",
                            failureMessage = "Friend could not be removed.",
                        )
                ) {
                    is AppResult.Success -> AppResult.Success(Unit)
                    is AppResult.Error -> result
                    AppResult.Loading -> AppResult.Loading
                }
            }

        private suspend fun <T> runAuthenticated(
            request: suspend () -> Response<T>,
            emptyBodyMessage: String,
            failureMessage: String,
        ): AppResult<T> =
            try {
                val response =
                    requestExecutor.execute(
                        request = request,
                        refreshAfterUnauthorized = sessionRepository::refreshAfterUnauthorized,
                        onUnauthorizedAfterRetry = sessionRepository::invalidateSession,
                    )
                when {
                    response.code() == HTTP_UNAUTHORIZED ->
                        AppResult.Error(AppException.UnauthorizedException())
                    !response.isSuccessful ->
                        AppResult.Error(AppException.NetworkException(response.message().ifBlank { failureMessage }))
                    else -> {
                        val body =
                            response.body()
                                ?: return AppResult.Error(AppException.NetworkException(emptyBodyMessage))
                        AppResult.Success(body)
                    }
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: IOException) {
                AppResult.Error(AppException.NetworkException(exception.message ?: failureMessage, exception))
            } catch (exception: SerializationException) {
                AppResult.Error(AppException.NetworkException("$failureMessage (invalid response).", exception))
            }

        private companion object {
            const val HTTP_UNAUTHORIZED = 401
        }
    }
