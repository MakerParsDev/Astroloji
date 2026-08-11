package com.parsfilo.astrology.core.data.repository

import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.BirthDataResponse
import com.parsfilo.astrology.core.data.remote.CityResponse
import com.parsfilo.astrology.core.data.remote.SaveBirthDataRequest
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
class BirthDataRepository
    @Inject
    constructor(
        private val api: AstrologyApi,
        private val sessionRepository: SessionRepository,
        private val requestExecutor: AuthenticatedRequestExecutor,
        private val dispatchers: DispatchersProvider,
    ) {
        /**
         * Public, unauthenticated on the backend (see workers/cities.ts) — runs before the
         * user has an account, so this intentionally does not go through [requestExecutor].
         */
        suspend fun searchCities(query: String): AppResult<List<CityResponse>> =
            withContext(dispatchers.io) {
                try {
                    val response = api.searchCities(query)
                    if (!response.isSuccessful) {
                        return@withContext AppResult.Error(
                            AppException.NetworkException(response.message().ifBlank { "City search failed." }),
                        )
                    }
                    AppResult.Success(response.body()?.cities.orEmpty())
                } catch (exception: CancellationException) {
                    throw exception
                } catch (exception: IOException) {
                    AppResult.Error(
                        AppException.NetworkException(exception.message ?: "City search failed.", exception),
                    )
                } catch (exception: SerializationException) {
                    AppResult.Error(AppException.NetworkException("City search response was invalid.", exception))
                }
            }

        suspend fun saveBirthData(
            localDate: String,
            localTime: String?,
            timeCertainty: String,
            cityId: String,
        ): AppResult<BirthDataResponse> =
            withContext(dispatchers.io) {
                try {
                    val response =
                        requestExecutor.execute(
                            request = {
                                api.saveBirthData(
                                    SaveBirthDataRequest(
                                        localDate = localDate,
                                        localTime = localTime,
                                        timeCertainty = timeCertainty,
                                        cityId = cityId,
                                    ),
                                )
                            },
                            refreshAfterUnauthorized = sessionRepository::refreshAfterUnauthorized,
                            onUnauthorizedAfterRetry = sessionRepository::invalidateSession,
                        )
                    when {
                        response.code() == HTTP_UNAUTHORIZED ->
                            AppResult.Error(AppException.UnauthorizedException())
                        !response.isSuccessful ->
                            AppResult.Error(
                                AppException.NetworkException(
                                    response.message().ifBlank { "Birth data could not be saved." },
                                ),
                            )
                        else -> {
                            val body =
                                response.body()
                                    ?: return@withContext AppResult.Error(
                                        AppException.NetworkException("Birth data response was empty."),
                                    )
                            AppResult.Success(body)
                        }
                    }
                } catch (exception: CancellationException) {
                    throw exception
                } catch (exception: IOException) {
                    AppResult.Error(
                        AppException.NetworkException(exception.message ?: "Birth data could not be saved.", exception),
                    )
                } catch (exception: SerializationException) {
                    AppResult.Error(AppException.NetworkException("Birth data response was invalid.", exception))
                }
            }

        private companion object {
            const val HTTP_UNAUTHORIZED = 401
        }
    }
