package com.parsfilo.astrology.core.data.push

import com.google.firebase.installations.FirebaseInstallations
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

interface PushRegistrationManager {
    suspend fun register(): String?

    suspend fun unregister()
}

@Singleton
class FirebasePushRegistrationManager
    @Inject
    constructor(
        private val messaging: FirebaseMessaging,
        private val installations: FirebaseInstallations,
    ) : PushRegistrationManager {
        override suspend fun register(): String? {
            messaging.register().await()
            return installations.id
                .await()
                .trim()
                .takeIf(String::isNotEmpty)
        }

        override suspend fun unregister() {
            val unregisterFailure =
                runCatching { messaging.unregister().await() }
                    .exceptionOrNull()
            if (unregisterFailure is CancellationException) throw unregisterFailure

            val deletionFailure =
                runCatching { installations.delete().await() }
                    .exceptionOrNull()
            if (deletionFailure is CancellationException) throw deletionFailure

            val firstFailure = unregisterFailure ?: deletionFailure
            if (unregisterFailure != null && deletionFailure != null) {
                unregisterFailure.addSuppressed(deletionFailure)
            }
            firstFailure?.let { throw it }
        }
    }
