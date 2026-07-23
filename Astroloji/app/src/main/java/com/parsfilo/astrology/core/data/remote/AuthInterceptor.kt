package com.parsfilo.astrology.core.data.remote

import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.util.DispatchersProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthInterceptor
    @Inject
    constructor(
        private val userPreferencesRepository: UserPreferencesRepository,
        dispatchers: DispatchersProvider,
    ) : Interceptor {
        @Volatile private var cachedJwt: String? = null

        init {
            CoroutineScope(SupervisorJob() + dispatchers.io).launch {
                userPreferencesRepository.preferences.collect { prefs ->
                    cachedJwt = prefs.jwt
                }
            }
        }

        override fun intercept(chain: Interceptor.Chain): Response {
            val jwt = cachedJwt
            val request =
                chain
                    .request()
                    .newBuilder()
                    .apply {
                        if (!jwt.isNullOrBlank() && chain.request().header("Authorization").isNullOrBlank()) {
                            header("Authorization", "Bearer $jwt")
                        }
                    }.build()
            return chain.proceed(request)
        }
    }
