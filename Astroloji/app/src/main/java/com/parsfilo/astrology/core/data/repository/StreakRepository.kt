package com.parsfilo.astrology.core.data.repository

import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.StreakCheckInResponse
import com.parsfilo.astrology.core.data.session.AuthenticatedRequestExecutor
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.DispatchersProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class StreakRepository
    @Inject
    constructor(
        private val api: AstrologyApi,
        private val sessionRepository: SessionRepository,
        private val requestExecutor: AuthenticatedRequestExecutor,
        private val dispatchers: DispatchersProvider,
    ) {
        suspend fun checkIn(): AppResult<StreakCheckInResponse> =
            withContext(dispatchers.io) {
                try {
                    val response =
                        requestExecutor.execute(
                            request = { api.checkInStreak() },
                            refreshAfterUnauthorized = sessionRepository::refreshAfterUnauthorized,
                            onUnauthorizedAfterRetry = sessionRepository::invalidateSession,
                        )
                    when {
                        response.code() == HTTP_UNAUTHORIZED ->
                            AppResult.Error(AppException.UnauthorizedException())
                        !response.isSuccessful ->
                            AppResult.Error(
                                AppException.NetworkException(
                                    response.message().ifBlank { "Streak check-in failed." },
                                ),
                            )
                        else -> {
                            val body =
                                response.body()
                                    ?: return@withContext AppResult.Error(
                                        AppException.NetworkException("Streak check-in response was empty."),
                                    )
                            AppResult.Success(body)
                        }
                    }
                } catch (exception: CancellationException) {
                    throw exception
                } catch (exception: IOException) {
                    AppResult.Error(
                        AppException.NetworkException(exception.message ?: "Streak check-in failed.", exception),
                    )
                } catch (exception: SerializationException) {
                    AppResult.Error(AppException.NetworkException("Streak check-in response was invalid.", exception))
                }
            }

        private companion object {
            const val HTTP_UNAUTHORIZED = 401
        }
    }
