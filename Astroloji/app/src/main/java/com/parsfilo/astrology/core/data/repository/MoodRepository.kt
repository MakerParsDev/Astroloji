package com.parsfilo.astrology.core.data.repository

import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.MoodInsightResponse
import com.parsfilo.astrology.core.data.remote.MoodLogRequest
import com.parsfilo.astrology.core.data.remote.MoodLogResponse
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
class MoodRepository
    @Inject
    constructor(
        private val api: AstrologyApi,
        private val sessionRepository: SessionRepository,
        private val requestExecutor: AuthenticatedRequestExecutor,
        private val dispatchers: DispatchersProvider,
    ) {
        suspend fun logMood(
            mood: String,
            domain: String?,
        ): AppResult<MoodLogResponse> =
            withContext(dispatchers.io) {
                runAuthenticated(
                    request = { api.logMood(MoodLogRequest(mood = mood, domain = domain)) },
                    emptyBodyMessage = "Mood log response was empty.",
                    failureMessage = "Mood could not be logged.",
                )
            }

        suspend fun getInsight(): AppResult<MoodInsightResponse> =
            withContext(dispatchers.io) {
                runAuthenticated(
                    request = { api.getMoodInsight() },
                    emptyBodyMessage = "Mood insight response was empty.",
                    failureMessage = "Mood insight could not be loaded.",
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
        }
    }
