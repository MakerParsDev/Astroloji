package com.parsfilo.astrology.core.data.repository

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.messaging.FirebaseMessaging
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.data.local.AstrologyDatabase
import com.parsfilo.astrology.core.data.local.UserProfileEntity
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.RegisterUserRequest
import com.parsfilo.astrology.core.data.remote.UpdateUserRequest
import com.parsfilo.astrology.core.data.remote.VerifySubscriptionRequest
import com.parsfilo.astrology.core.data.session.AuthenticatedRequestExecutor
import com.parsfilo.astrology.core.data.session.SessionRefreshCoordinator
import com.parsfilo.astrology.core.data.session.SessionTokenStore
import com.parsfilo.astrology.core.domain.model.SubscriptionStatus
import com.parsfilo.astrology.core.domain.model.UserPreferences
import com.parsfilo.astrology.core.domain.model.UserProfile
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.DispatchersProvider
import com.parsfilo.astrology.core.util.StringsProvider
import com.parsfilo.astrology.core.util.TimeUtils
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
@Suppress("LongParameterList")
class SessionRepository
    @Inject
    constructor(
        private val firebaseAuth: FirebaseAuth,
        private val api: AstrologyApi,
        private val preferencesRepository: UserPreferencesRepository,
        private val database: AstrologyDatabase,
        private val dispatchers: DispatchersProvider,
        private val stringsProvider: StringsProvider,
        private val tokenStore: SessionTokenStore,
        private val refreshCoordinator: SessionRefreshCoordinator,
        private val requestExecutor: AuthenticatedRequestExecutor,
    ) {
        private val userProfileDao = database.userProfileDao()

        suspend fun registerFromPreferences(): AppResult<UserProfile> =
            withContext(dispatchers.io) {
                val jwtResult = refreshSessionToken(forceRefreshFirebaseToken = true)
                if (jwtResult is AppResult.Error) {
                    return@withContext jwtResult
                }
                loadProfile()
            }

        suspend fun refreshSessionToken(forceRefreshFirebaseToken: Boolean): AppResult<String> =
            withContext(dispatchers.io) {
                val preferences = preferencesRepository.current()
                if (tokenStore.current() == null) {
                    tokenStore.update(preferences.jwt)
                }
                refreshCoordinator.refresh(
                    rejectedToken = null,
                    requireRefresh = forceRefreshFirebaseToken,
                    currentToken = tokenStore::currentUsable,
                ) {
                    refreshAppJwt(preferences, forceRefreshFirebaseToken = forceRefreshFirebaseToken)
                }
            }

        suspend fun refreshSessionIfNeeded(): String? =
            when (val result = refreshSessionToken(forceRefreshFirebaseToken = false)) {
                is AppResult.Success -> result.data
                is AppResult.Error -> null
                AppResult.Loading -> null
            }

        suspend fun refreshAfterUnauthorized(rejectedToken: String?): AppResult<String> =
            withContext(dispatchers.io) {
                val preferences = preferencesRepository.current()
                val result =
                    refreshCoordinator.refresh(
                        rejectedToken = rejectedToken,
                        requireRefresh = true,
                        currentToken = tokenStore::currentUsable,
                    ) {
                        refreshAppJwt(preferences, forceRefreshFirebaseToken = true)
                    }
                when (result) {
                    is AppResult.Success -> result
                    is AppResult.Error,
                    AppResult.Loading,
                    -> {
                        clearInvalidSession()
                        AppResult.Error(AppException.UnauthorizedException())
                    }
                }
            }

        suspend fun loadProfile(): AppResult<UserProfile> =
            withContext(dispatchers.io) {
                val response =
                    requestExecutor.execute(
                        api::getUserProfile,
                        ::refreshAfterUnauthorized,
                        ::clearInvalidSession,
                    )
                if (!response.isSuccessful) {
                    return@withContext AppResult.Error(
                        if (response.code() == 401) {
                            AppException.UnauthorizedException()
                        } else {
                            AppException.NetworkException(stringsProvider.get(R.string.session_error_profile_fetch_failed))
                        },
                    )
                }

                val body =
                    response.body()
                        ?: return@withContext AppResult.Error(
                            AppException.NetworkException(stringsProvider.get(R.string.session_error_profile_empty)),
                        )
                val jwt = preferencesRepository.getJwt().orEmpty()
                val entity =
                    UserProfileEntity(
                        userId = body.userId,
                        sign = body.sign,
                        language = body.language,
                        isPremium = body.isPremium,
                        subscriptionState = body.subscriptionState,
                        premiumExpiresAt = TimeUtils.parseIsoMillis(body.premiumExpiresAt),
                        jwt = jwt,
                        utcOffset = body.utcOffset,
                        notificationEnabled = body.notificationEnabled,
                        notificationHour = body.notificationHour,
                        updatedAt = System.currentTimeMillis(),
                    )
                userProfileDao.upsert(entity)
                preferencesRepository.updateSession(
                    userId = entity.userId,
                    jwt = jwt,
                    isPremium = entity.isPremium,
                    premiumExpiresAt = entity.premiumExpiresAt,
                    subscriptionState = entity.subscriptionState,
                    sign = entity.sign,
                    language = entity.language,
                    utcOffset = entity.utcOffset,
                    notificationEnabled = entity.notificationEnabled,
                    notificationHour = entity.notificationHour,
                )
                AppResult.Success(entity.toDomain())
            }

        suspend fun updateProfile(request: UpdateUserRequest): AppResult<UserProfile> =
            withContext(dispatchers.io) {
                val response =
                    requestExecutor.execute(
                        { api.updateUser(request) },
                        ::refreshAfterUnauthorized,
                        ::clearInvalidSession,
                    )
                if (!response.isSuccessful) {
                    return@withContext AppResult.Error(
                        if (response.code() == 401) {
                            AppException.UnauthorizedException()
                        } else {
                            AppException.NetworkException(stringsProvider.get(R.string.session_error_profile_update_failed))
                        },
                    )
                }
                val body =
                    response.body()
                        ?: return@withContext AppResult.Error(
                            AppException.NetworkException(stringsProvider.get(R.string.session_error_profile_empty)),
                        )
                val jwt = preferencesRepository.getJwt().orEmpty()
                val entity =
                    UserProfileEntity(
                        userId = body.userId,
                        sign = body.sign,
                        language = body.language,
                        isPremium = body.isPremium,
                        subscriptionState = body.subscriptionState,
                        premiumExpiresAt = TimeUtils.parseIsoMillis(body.premiumExpiresAt),
                        jwt = jwt,
                        utcOffset = body.utcOffset,
                        notificationEnabled = body.notificationEnabled,
                        notificationHour = body.notificationHour,
                        updatedAt = System.currentTimeMillis(),
                    )
                userProfileDao.upsert(entity)
                preferencesRepository.updateSession(
                    userId = entity.userId,
                    jwt = entity.jwt,
                    isPremium = entity.isPremium,
                    premiumExpiresAt = entity.premiumExpiresAt,
                    subscriptionState = entity.subscriptionState,
                    sign = entity.sign,
                    language = entity.language,
                    utcOffset = entity.utcOffset,
                    notificationEnabled = entity.notificationEnabled,
                    notificationHour = entity.notificationHour,
                )
                AppResult.Success(entity.toDomain())
            }

        suspend fun deleteAccount(): AppResult<Unit> =
            withContext(dispatchers.io) {
                try {
                    val response =
                        requestExecutor.execute(
                            api::deleteUser,
                            ::refreshAfterUnauthorized,
                            ::clearInvalidSession,
                        )
                    if (!response.isSuccessful) {
                        return@withContext AppResult.Error(
                            if (response.code() == 401) {
                                AppException.UnauthorizedException()
                            } else {
                                AppException.NetworkException(
                                    stringsProvider.get(R.string.session_error_account_delete_failed),
                                )
                            },
                        )
                    }

                    runCatching { FirebaseMessaging.getInstance().deleteToken().await() }
                        .onFailure { Timber.w(it, "FCM token could not be removed during account deletion.") }
                    firebaseAuth.signOut()
                    database.clearAllTables()
                    preferencesRepository.clearAll()
                    tokenStore.update(null)
                    AppResult.Success(Unit)
                } catch (exception: CancellationException) {
                    throw exception
                } catch (exception: Exception) {
                    AppResult.Error(
                        AppException.UnknownException(
                            stringsProvider.get(R.string.session_error_account_delete_failed),
                            exception,
                        ),
                    )
                }
            }

        suspend fun invalidateSession() =
            withContext(dispatchers.io) {
                clearInvalidSession()
            }

        suspend fun retryAfterUnauthorized(block: suspend () -> AppResult<UserProfile>): AppResult<UserProfile> =
            when (refreshAfterUnauthorized(tokenStore.current())) {
                is AppResult.Success -> block()
                is AppResult.Error,
                AppResult.Loading,
                -> AppResult.Error(AppException.UnauthorizedException())
            }

        suspend fun apiVerify(request: VerifySubscriptionRequest): AppResult<SubscriptionStatus> =
            withContext(dispatchers.io) {
                val response =
                    requestExecutor.execute(
                        { api.verifySubscription(request) },
                        ::refreshAfterUnauthorized,
                        ::clearInvalidSession,
                    )
                if (!response.isSuccessful) {
                    return@withContext AppResult.Error(
                        if (response.code() == 401) {
                            AppException.UnauthorizedException()
                        } else {
                            AppException.BillingException(stringsProvider.get(R.string.session_error_subscription_verify_failed))
                        },
                    )
                }
                val body =
                    response.body()
                        ?: return@withContext AppResult.Error(
                            AppException.BillingException(stringsProvider.get(R.string.session_error_subscription_empty)),
                        )
                val expiresAt = TimeUtils.parseIsoMillis(body.premiumExpiresAt)
                val preferences = preferencesRepository.current()
                preferencesRepository.updateSession(
                    userId = preferences.userId.orEmpty(),
                    jwt = preferences.jwt.orEmpty(),
                    isPremium = body.isPremium,
                    premiumExpiresAt = expiresAt,
                    subscriptionState = body.subscriptionState,
                    sign = preferences.selectedSign,
                    language = preferences.language,
                    utcOffset = preferences.utcOffset,
                    notificationEnabled = preferences.notificationEnabled,
                    notificationHour = preferences.notificationHour,
                )
                userProfileDao.getProfile()?.let {
                    userProfileDao.upsert(
                        it.copy(
                            isPremium = body.isPremium,
                            subscriptionState = body.subscriptionState,
                            premiumExpiresAt = expiresAt,
                            updatedAt = System.currentTimeMillis(),
                        ),
                    )
                }
                refreshPremiumClaims(preferences, body.isPremium, expiresAt)
                AppResult.Success(
                    SubscriptionStatus(
                        isPremium = body.isPremium,
                        premiumExpiresAt = expiresAt,
                        productId = body.productId,
                    ),
                )
            }

        suspend fun apiRestore(request: VerifySubscriptionRequest): AppResult<SubscriptionStatus> =
            withContext(dispatchers.io) {
                val response =
                    requestExecutor.execute(
                        { api.restoreSubscription(request) },
                        ::refreshAfterUnauthorized,
                        ::clearInvalidSession,
                    )
                if (!response.isSuccessful) {
                    return@withContext AppResult.Error(
                        if (response.code() == 401) {
                            AppException.UnauthorizedException()
                        } else {
                            AppException.BillingException(stringsProvider.get(R.string.session_error_restore_failed))
                        },
                    )
                }
                val body =
                    response.body()
                        ?: return@withContext AppResult.Error(
                            AppException.BillingException(stringsProvider.get(R.string.session_error_restore_empty)),
                        )
                val expiresAt = TimeUtils.parseIsoMillis(body.premiumExpiresAt)
                val preferences = preferencesRepository.current()
                preferencesRepository.updateSession(
                    userId = preferences.userId.orEmpty(),
                    jwt = preferences.jwt.orEmpty(),
                    isPremium = body.isPremium,
                    premiumExpiresAt = expiresAt,
                    subscriptionState = body.subscriptionState,
                    sign = preferences.selectedSign,
                    language = preferences.language,
                    utcOffset = preferences.utcOffset,
                    notificationEnabled = preferences.notificationEnabled,
                    notificationHour = preferences.notificationHour,
                )
                userProfileDao.getProfile()?.let {
                    userProfileDao.upsert(
                        it.copy(
                            isPremium = body.isPremium,
                            subscriptionState = body.subscriptionState,
                            premiumExpiresAt = expiresAt,
                            updatedAt = System.currentTimeMillis(),
                        ),
                    )
                }
                refreshPremiumClaims(preferences, body.isPremium, expiresAt)
                AppResult.Success(
                    SubscriptionStatus(
                        isPremium = body.isPremium,
                        premiumExpiresAt = expiresAt,
                        productId = body.productId,
                    ),
                )
            }

        private suspend fun refreshAppJwt(
            preferences: UserPreferences,
            forceRefreshFirebaseToken: Boolean,
        ): AppResult<String> =
            runCatching {
                val firebaseToken = ensureFirebaseIdToken(forceRefreshFirebaseToken)
                val fcmToken =
                    runCatching { FirebaseMessaging.getInstance().token.await() }
                        .onFailure { Timber.w(it, "FCM token could not be retrieved, using a local fallback token.") }
                        .getOrDefault("fcm-${UUID.randomUUID()}")
                val response =
                    api.registerUser(
                        authorization = "Bearer $firebaseToken",
                        RegisterUserRequest(
                            sign = preferences.selectedSign,
                            language = preferences.language,
                            fcmToken = fcmToken.ifBlank { "fcm-${UUID.randomUUID()}" },
                            notificationHour = preferences.notificationHour,
                            utcOffset = preferences.utcOffset,
                            platform = "android",
                        ),
                    )
                if (!response.isSuccessful) {
                    val errorBody = response.errorBody()?.string()?.takeIf { it.isNotBlank() }
                    throw AppException.NetworkException(
                        errorBody ?: stringsProvider.get(R.string.session_error_register_failed_code, response.code()),
                    )
                }
                val body =
                    response.body() ?: throw AppException.NetworkException(stringsProvider.get(R.string.session_error_register_empty))
                val premiumExpiresAt = TimeUtils.parseIsoMillis(body.premiumExpiresAt)
                preferencesRepository.updateSession(
                    userId = body.userId,
                    jwt = body.jwt,
                    isPremium = body.isPremium,
                    premiumExpiresAt = premiumExpiresAt,
                    subscriptionState = body.subscriptionState,
                    sign = preferences.selectedSign,
                    language = preferences.language,
                    utcOffset = preferences.utcOffset,
                    notificationEnabled = preferences.notificationEnabled,
                    notificationHour = preferences.notificationHour,
                )
                userProfileDao.upsert(
                    UserProfileEntity(
                        userId = body.userId,
                        sign = preferences.selectedSign,
                        language = preferences.language,
                        isPremium = body.isPremium,
                        subscriptionState = body.subscriptionState,
                        premiumExpiresAt = premiumExpiresAt,
                        jwt = body.jwt,
                        utcOffset = preferences.utcOffset,
                        notificationEnabled = preferences.notificationEnabled,
                        notificationHour = preferences.notificationHour,
                        updatedAt = System.currentTimeMillis(),
                    ),
                )
                tokenStore.update(body.jwt)
                body.jwt
            }.fold(
                onSuccess = { AppResult.Success(it) },
                onFailure = {
                    AppResult.Error(
                        if (it is AppException) {
                            it
                        } else {
                            AppException.UnknownException(
                                stringsProvider.get(R.string.session_error_refresh_failed),
                                it,
                            )
                        },
                    )
                },
            )

        private suspend fun refreshPremiumClaims(
            preferences: UserPreferences,
            isPremium: Boolean,
            premiumExpiresAt: Long?,
        ) {
            val refreshed =
                runCatching {
                    requestExecutor.execute(
                        api::refreshUserToken,
                        ::refreshAfterUnauthorized,
                        ::clearInvalidSession,
                    )
                }.getOrNull()
            if (refreshed?.isSuccessful == true) {
                val body = refreshed.body()
                if (body != null) {
                    preferencesRepository.updateSession(
                        userId = preferences.userId.orEmpty(),
                        jwt = body.jwt,
                        isPremium = body.isPremium,
                        premiumExpiresAt = premiumExpiresAt,
                        subscriptionState = body.subscriptionState,
                        sign = preferences.selectedSign,
                        language = preferences.language,
                        utcOffset = preferences.utcOffset,
                        notificationEnabled = preferences.notificationEnabled,
                        notificationHour = preferences.notificationHour,
                    )
                    userProfileDao.getProfile()?.let {
                        userProfileDao.upsert(
                            it.copy(
                                jwt = body.jwt,
                                isPremium = body.isPremium,
                                subscriptionState = body.subscriptionState,
                                premiumExpiresAt = premiumExpiresAt,
                                updatedAt = System.currentTimeMillis(),
                            ),
                        )
                    }
                    tokenStore.update(body.jwt)
                    return
                }
            }

            refreshSessionToken(forceRefreshFirebaseToken = true)
        }

        private suspend fun clearInvalidSession() {
            tokenStore.update(null)
            runCatching { preferencesRepository.clearSession() }
                .onFailure { Timber.w(it, "Session preferences could not be cleared after refresh failure.") }
            runCatching { userProfileDao.clear() }
                .onFailure { Timber.w(it, "Cached user profile could not be cleared after refresh failure.") }
            runCatching { firebaseAuth.signOut() }
                .onFailure { Timber.w(it, "Firebase session could not be signed out after refresh failure.") }
        }

        private suspend fun ensureFirebaseIdToken(forceRefresh: Boolean): String {
            val currentUser = firebaseAuth.currentUser
            if (currentUser != null) {
                return currentUser.getIdToken(forceRefresh).await()?.token
                    ?: throw AppException.UnauthorizedException()
            }

            val signedInUser =
                try {
                    firebaseAuth.signInAnonymously().await().user
                } catch (exception: Exception) {
                    if (exception.shouldFallbackToEmailPassword()) {
                        Timber.w(exception, "Anonymous auth is unavailable, falling back to a generated email/password Firebase session.")
                        signInWithFallbackCredentials()
                    } else {
                        throw exception
                    }
                }

            return signedInUser?.getIdToken(forceRefresh)?.await()?.token
                ?: throw AppException.UnauthorizedException()
        }

        private suspend fun signInWithFallbackCredentials() =
            withContext(dispatchers.io) {
                val storedCredentials = preferencesRepository.getFallbackAuthCredentials()
                val (email, password) = storedCredentials ?: generateFallbackCredentials()

                val user =
                    runCatching {
                        firebaseAuth.signInWithEmailAndPassword(email, password).await().user
                    }.getOrElse { signInError ->
                        if (!signInError.canCreateFallbackAccount()) {
                            throw signInError
                        }

                        runCatching {
                            firebaseAuth.createUserWithEmailAndPassword(email, password).await().user
                        }.getOrElse { createError ->
                            if (createError.isExistingAccountError()) {
                                firebaseAuth.signInWithEmailAndPassword(email, password).await().user
                            } else {
                                throw createError
                            }
                        }
                    } ?: throw AppException.UnauthorizedException()

                preferencesRepository.storeFallbackAuthCredentials(email, password)
                user
            }

        private fun generateFallbackCredentials(): Pair<String, String> {
            val seed = UUID.randomUUID().toString().replace("-", "")
            val email = "astroloji-$seed@parsfilo.dev"
            val password = "Pars!${seed.take(12)}${seed.takeLast(8)}"
            return email to password
        }

        private fun Exception.shouldFallbackToEmailPassword(): Boolean {
            val code = (this as? FirebaseAuthException)?.errorCode.orEmpty()
            val message = message.orEmpty()
            return code == "ERROR_ADMIN_RESTRICTED_OPERATION" ||
                code == "ERROR_OPERATION_NOT_ALLOWED" ||
                message.contains("ADMIN_ONLY_OPERATION", ignoreCase = true) ||
                message.contains("operation-not-allowed", ignoreCase = true)
        }

        private fun Throwable.canCreateFallbackAccount(): Boolean {
            val code = (this as? FirebaseAuthException)?.errorCode.orEmpty()
            return code == "ERROR_INVALID_CREDENTIAL" ||
                code == "ERROR_INVALID_LOGIN_CREDENTIALS" ||
                code == "ERROR_USER_NOT_FOUND" ||
                code == "ERROR_WRONG_PASSWORD" ||
                code == "ERROR_INVALID_EMAIL" ||
                code == "ERROR_INTERNAL_ERROR"
        }

        private fun Throwable.isExistingAccountError(): Boolean {
            val code = (this as? FirebaseAuthException)?.errorCode.orEmpty()
            return code == "ERROR_EMAIL_ALREADY_IN_USE"
        }

        private fun UserProfileEntity.toDomain(): UserProfile =
            UserProfile(
                userId = userId,
                sign = sign,
                language = language,
                isPremium = isPremium,
                subscriptionState = subscriptionState,
                premiumExpiresAt = premiumExpiresAt,
                jwt = jwt,
                utcOffset = utcOffset,
                notificationEnabled = notificationEnabled,
                notificationHour = notificationHour,
            )
    }
