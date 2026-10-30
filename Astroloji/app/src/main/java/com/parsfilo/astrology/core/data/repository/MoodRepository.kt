package com.parsfilo.astrology.core.data.repository

import android.database.sqlite.SQLiteException
import com.parsfilo.astrology.core.data.local.QueuedEventDao
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
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
@Suppress("LongParameterList")
class MoodRepository
    @Inject
    constructor(
        private val api: AstrologyApi,
        private val sessionRepository: SessionRepository,
        private val queuedEventDao: QueuedEventDao,
        private val preferencesRepository: UserPreferencesRepository,
        private val syncGate: MoodAnalyticsSyncGate,
        private val requestExecutor: AuthenticatedRequestExecutor,
        private val dispatchers: DispatchersProvider,
    ) {
        suspend fun logMood(
            mood: String,
            domain: String?,
        ): AppResult<MoodLogResponse> =
            withContext(dispatchers.io) {
                // An in-flight POST must finish before account-preserving deletion
                // starts; otherwise its D1 write could restore erased mood history.
                syncGate.withLock {
                    runAuthenticated(
                        request = { api.logMood(MoodLogRequest(mood = mood, domain = domain)) },
                        emptyBodyMessage = "Mood log response was empty.",
                        failureMessage = "Mood could not be logged.",
                    )
                }
            }

        /** Removes account-scoped mood history, not the user account or third-party GA4 history. */
        suspend fun deleteMoodHistory(): AppResult<Unit> =
            withContext(dispatchers.io) {
                syncGate.withLock {
                    try {
                        val ownerId =
                            preferencesRepository.current().userId?.takeIf { it.isNotBlank() }
                                ?: return@withLock AppResult.Error(AppException.UnauthorizedException())
                        val response =
                            requestExecutor.execute(
                                request = { api.deleteMoodHistory() },
                                refreshAfterUnauthorized = sessionRepository::refreshAfterUnauthorized,
                                onUnauthorizedAfterRetry = sessionRepository::invalidateSession,
                            )
                        when {
                            response.code() == HTTP_UNAUTHORIZED ->
                                AppResult.Error(AppException.UnauthorizedException())
                            !response.isSuccessful ->
                                AppResult.Error(
                                    AppException.NetworkException(
                                        response.message().ifBlank { "Mood history could not be deleted." },
                                    ),
                                )
                            else -> {
                                // Do not replay pending mood events after account-preserving
                                // deletion; otherwise old offline events can repopulate D1.
                                // The deletion request was issued under the captured owner.
                                // Do not erase another account's pending analytics.
                                queuedEventDao.deleteByType(AnalyticsEvents.MOOD_LOGGED, ownerId)
                                AppResult.Success(Unit)
                            }
                        }
                    } catch (exception: CancellationException) {
                        throw exception
                    } catch (exception: IOException) {
                        AppResult.Error(
                            AppException.NetworkException(
                                exception.message ?: "Mood history could not be deleted.",
                                exception,
                            ),
                        )
                    } catch (exception: SQLiteException) {
                        // The server-side delete succeeded, but retry is safe and
                        // required when pending local mood events could be replayed.
                        AppResult.Error(
                            AppException.NetworkException(
                                "Pending mood events could not be cleared. Retry deletion.",
                                exception,
                            ),
                        )
                    } catch (exception: SerializationException) {
                        AppResult.Error(AppException.NetworkException("Mood deletion response was invalid.", exception))
                    }
                }
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
