package com.parsfilo.astrology.core.data.repository

import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.CreditBalanceResponse
import com.parsfilo.astrology.core.data.remote.SpendCreditsRequest
import com.parsfilo.astrology.core.data.remote.SpendCreditsResponse
import com.parsfilo.astrology.core.data.remote.VerifyCreditPurchaseRequest
import com.parsfilo.astrology.core.data.remote.VerifyCreditPurchaseResponse
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
class CreditsRepository
    @Inject
    constructor(
        private val api: AstrologyApi,
        private val sessionRepository: SessionRepository,
        private val requestExecutor: AuthenticatedRequestExecutor,
        private val dispatchers: DispatchersProvider,
    ) {
        suspend fun verifyPurchase(
            purchaseToken: String,
            productId: String,
        ): AppResult<VerifyCreditPurchaseResponse> =
            withContext(dispatchers.io) {
                try {
                    val response =
                        requestExecutor.execute(
                            request = {
                                api.verifyCreditPurchase(
                                    VerifyCreditPurchaseRequest(purchaseToken = purchaseToken, productId = productId),
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
                                    response.message().ifBlank { "Credit purchase could not be verified." },
                                ),
                            )
                        else -> {
                            val body =
                                response.body()
                                    ?: return@withContext AppResult.Error(
                                        AppException.NetworkException("Credit purchase response was empty."),
                                    )
                            AppResult.Success(body)
                        }
                    }
                } catch (exception: CancellationException) {
                    throw exception
                } catch (exception: IOException) {
                    AppResult.Error(
                        AppException.NetworkException(
                            exception.message ?: "Credit purchase could not be verified.",
                            exception,
                        ),
                    )
                } catch (exception: SerializationException) {
                    AppResult.Error(AppException.NetworkException("Credit purchase response was invalid.", exception))
                }
            }

        suspend fun spend(
            amount: Int,
            feature: String,
        ): AppResult<SpendCreditsResponse> =
            withContext(dispatchers.io) {
                try {
                    val response =
                        requestExecutor.execute(
                            request = { api.spendCredits(SpendCreditsRequest(amount = amount, feature = feature)) },
                            refreshAfterUnauthorized = sessionRepository::refreshAfterUnauthorized,
                            onUnauthorizedAfterRetry = sessionRepository::invalidateSession,
                        )
                    when {
                        response.code() == HTTP_UNAUTHORIZED ->
                            AppResult.Error(AppException.UnauthorizedException())
                        response.code() == HTTP_INSUFFICIENT_CREDITS ->
                            AppResult.Error(AppException.BillingException("Insufficient credits."))
                        !response.isSuccessful ->
                            AppResult.Error(
                                AppException.NetworkException(
                                    response.message().ifBlank { "Credits could not be spent." },
                                ),
                            )
                        else -> {
                            val body =
                                response.body()
                                    ?: return@withContext AppResult.Error(
                                        AppException.NetworkException("Spend credits response was empty."),
                                    )
                            AppResult.Success(body)
                        }
                    }
                } catch (exception: CancellationException) {
                    throw exception
                } catch (exception: IOException) {
                    AppResult.Error(
                        AppException.NetworkException(exception.message ?: "Credits could not be spent.", exception),
                    )
                } catch (exception: SerializationException) {
                    AppResult.Error(AppException.NetworkException("Spend credits response was invalid.", exception))
                }
            }

        suspend fun getBalance(): AppResult<CreditBalanceResponse> =
            withContext(dispatchers.io) {
                try {
                    val response =
                        requestExecutor.execute(
                            request = { api.getCreditBalance() },
                            refreshAfterUnauthorized = sessionRepository::refreshAfterUnauthorized,
                            onUnauthorizedAfterRetry = sessionRepository::invalidateSession,
                        )
                    when {
                        response.code() == HTTP_UNAUTHORIZED ->
                            AppResult.Error(AppException.UnauthorizedException())
                        !response.isSuccessful ->
                            AppResult.Error(
                                AppException.NetworkException(
                                    response.message().ifBlank { "Credit balance could not be loaded." },
                                ),
                            )
                        else -> {
                            val body =
                                response.body()
                                    ?: return@withContext AppResult.Error(
                                        AppException.NetworkException("Credit balance response was empty."),
                                    )
                            AppResult.Success(body)
                        }
                    }
                } catch (exception: CancellationException) {
                    throw exception
                } catch (exception: IOException) {
                    AppResult.Error(
                        AppException.NetworkException(
                            exception.message ?: "Credit balance could not be loaded.",
                            exception,
                        ),
                    )
                } catch (exception: SerializationException) {
                    AppResult.Error(AppException.NetworkException("Credit balance response was invalid.", exception))
                }
            }

        private companion object {
            const val HTTP_UNAUTHORIZED = 401
            const val HTTP_INSUFFICIENT_CREDITS = 402
        }
    }
