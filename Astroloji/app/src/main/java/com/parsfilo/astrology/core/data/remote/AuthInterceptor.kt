package com.parsfilo.astrology.core.data.remote

import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.session.SessionTokenStore
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
        private val tokenStore: SessionTokenStore,
        dispatchers: DispatchersProvider,
    ) : Interceptor {
        init {
            CoroutineScope(SupervisorJob() + dispatchers.io).launch {
                userPreferencesRepository.preferences.collect { prefs ->
                    tokenStore.update(prefs.jwt)
                }
            }
        }

        override fun intercept(chain: Interceptor.Chain): Response {
            val jwt = tokenStore.currentUsable()
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
