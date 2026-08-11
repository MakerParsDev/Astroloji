package com.parsfilo.astrology.core.data.repository

import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.ChatMessageRequest
import com.parsfilo.astrology.core.data.remote.ChatMessageResponse
import com.parsfilo.astrology.core.data.remote.ChatTurnPayload
import com.parsfilo.astrology.core.data.remote.DeepReadingRequest
import com.parsfilo.astrology.core.data.remote.DeepReadingResponse
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

data class ChatTurn(
    val role: String,
    val content: String,
)

@Singleton
class ReadingRepository
    @Inject
    constructor(
        private val api: AstrologyApi,
        private val sessionRepository: SessionRepository,
        private val requestExecutor: AuthenticatedRequestExecutor,
        private val dispatchers: DispatchersProvider,
    ) {
        suspend fun getDeepReading(language: String): AppResult<DeepReadingResponse> =
            withContext(dispatchers.io) {
                runAuthenticated(
                    request = { api.getDeepReading(DeepReadingRequest(language = language)) },
                    emptyBodyMessage = "Deep reading response was empty.",
                    failureMessage = "Deep reading could not be loaded.",
                )
            }

        suspend fun sendChatMessage(
            language: String,
            message: String,
            history: List<ChatTurn>,
        ): AppResult<ChatMessageResponse> =
            withContext(dispatchers.io) {
                runAuthenticated(
                    request = {
                        api.sendChatMessage(
                            ChatMessageRequest(
                                language = language,
                                message = message,
                                history = history.map { ChatTurnPayload(role = it.role, content = it.content) },
                            ),
                        )
                    },
                    emptyBodyMessage = "Chat response was empty.",
                    failureMessage = "Message could not be sent.",
                )
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
                    response.code() == HTTP_PAYMENT_REQUIRED ->
                        AppResult.Error(AppException.BillingException("Not enough credits."))
                    response.code() == HTTP_BAD_REQUEST ->
                        AppResult.Error(AppException.NetworkException("Birth data is required for this feature."))
                    !response.isSuccessful ->
                        AppResult.Error(AppException.NetworkException(response.message().ifBlank { failureMessage }))
                    else -> {
                        val body = response.body()
                        if (body == null) {
                            AppResult.Error(AppException.NetworkException(emptyBodyMessage))
                        } else {
                            AppResult.Success(body)
                        }
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
            const val HTTP_PAYMENT_REQUIRED = 402
            const val HTTP_BAD_REQUEST = 400
        }
    }
