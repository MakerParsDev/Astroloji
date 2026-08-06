package com.parsfilo.astrology.core.data.repository

import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.GuidanceEvidenceResponse
import com.parsfilo.astrology.core.data.remote.GuidanceSignalResponse
import com.parsfilo.astrology.core.data.remote.PersonalGuidanceRequest
import com.parsfilo.astrology.core.data.remote.PersonalGuidanceResponse
import com.parsfilo.astrology.core.data.session.AuthenticatedRequestExecutor
import com.parsfilo.astrology.core.domain.model.GuidanceEvidence
import com.parsfilo.astrology.core.domain.model.GuidanceSignal
import com.parsfilo.astrology.core.domain.model.PersonalGuidance
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
class ChartRepository
    @Inject
    constructor(
        private val api: AstrologyApi,
        private val sessionRepository: SessionRepository,
        private val requestExecutor: AuthenticatedRequestExecutor,
        private val dispatchers: DispatchersProvider,
    ) {
        suspend fun getPersonalGuidance(
            natalTimestamp: String,
            natalTimeCertainty: String,
            targetTimestamp: String,
            language: String,
        ): AppResult<PersonalGuidance> =
            withContext(dispatchers.io) {
                try {
                    val response =
                        requestExecutor.execute(
                            request = {
                                api.getPersonalGuidance(
                                    PersonalGuidanceRequest(
                                        natalTimestamp = natalTimestamp,
                                        natalTimeCertainty = natalTimeCertainty,
                                        targetTimestamp = targetTimestamp,
                                        language = language,
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
                                    response.message().ifBlank { "Personal guidance could not be loaded." },
                                ),
                            )
                        else -> {
                            val body =
                                response.body()
                                    ?: return@withContext AppResult.Error(
                                        AppException.NetworkException("Personal guidance response was empty."),
                                    )
                            AppResult.Success(body.toDomain())
                        }
                    }
                } catch (exception: CancellationException) {
                    throw exception
                } catch (exception: IOException) {
                    AppResult.Error(
                        AppException.NetworkException(
                            exception.message ?: "Personal guidance could not be loaded.",
                            exception,
                        ),
                    )
                } catch (exception: SerializationException) {
                    AppResult.Error(
                        AppException.NetworkException("Personal guidance response was invalid.", exception),
                    )
                }
            }

        private fun PersonalGuidanceResponse.toDomain(): PersonalGuidance =
            PersonalGuidance(
                version = version,
                calculationVersion = calculationVersion,
                generatedAt = generatedAt,
                targetTimestamp = targetTimestamp,
                language = language,
                signals = signals.map { it.toDomain() },
                limitations = limitations,
                disclaimer = disclaimer,
            )

        private fun GuidanceSignalResponse.toDomain(): GuidanceSignal =
            GuidanceSignal(
                id = id,
                priority = priority,
                domain = domain,
                title = title,
                summary = summary,
                actionPrompt = actionPrompt,
                evidence = evidence.toDomain(),
            )

        private fun GuidanceEvidenceResponse.toDomain(): GuidanceEvidence =
            GuidanceEvidence(
                transitBody = transitBody,
                natalBody = natalBody,
                aspect = aspect,
                orb = orb,
                maximumOrb = maximumOrb,
            )

        private companion object {
            const val HTTP_UNAUTHORIZED = 401
        }
    }
