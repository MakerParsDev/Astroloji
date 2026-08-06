package com.parsfilo.astrology.devicesmoke

import android.os.Bundle
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.truth.Truth.assertThat
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.installations.FirebaseInstallations
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LiveIdentityLifecycleSmokeTest {
    @Test(timeout = 120_000L)
    fun anonymousIdentityCompletesProductionLifecycle() =
        runBlocking {
            val instrumentation = InstrumentationRegistry.getInstrumentation()
            val arguments =
                SmokeArguments.from(
                    REQUIRED_ARGUMENTS.associateWith { key ->
                        InstrumentationRegistry.getArguments().getString(key).orEmpty()
                    },
                )
            val context = instrumentation.targetContext
            val options =
                FirebaseOptions
                    .Builder()
                    .setApiKey(arguments.firebaseApiKey)
                    .setApplicationId(arguments.firebaseAppId)
                    .setProjectId(arguments.firebaseProjectId)
                    .setGcmSenderId(arguments.firebaseSenderId)
                    .build()
            val appName = "device-smoke-${System.nanoTime()}"
            val app = requireNotNull(FirebaseApp.initializeApp(context, options, appName))
            val auth = FirebaseAuth.getInstance(app)
            val installations = FirebaseInstallations.getInstance(app)
            val client = BackendSmokeClient(arguments.backendBaseUrl)
            var firebaseUser: FirebaseUser? = null
            var firebaseToken: String? = null
            var fid: String? = null
            var cleanupJwt: String? = null
            var backendDeleted = false

            val lifecycleResult =
                runCatching {
                    stage("anonymous_auth")
                    val signedInUser = requireNotNull(auth.signInAnonymously().await().user)
                    firebaseUser = signedInUser
                    val issuedToken = requireNotNull(signedInUser.getIdToken(true).await().token)
                    firebaseToken = issuedToken
                    assertThat(issuedToken.isNotBlank()).isTrue()

                    stage("fid")
                    val installationId = installations.id.await().trim()
                    fid = installationId
                    assertThat(installationId.isNotBlank()).isTrue()

                    stage("register")
                    val registered =
                        client.register(
                            firebaseIdToken = requireNotNull(firebaseToken),
                            fid = requireNotNull(fid),
                        )
                    cleanupJwt = registered.jwt
                    assertThat(registered.userId.isNotBlank()).isTrue()
                    assertThat(registered.jwt.isNotBlank()).isTrue()

                    stage("profile")
                    val firstProfile = client.profile(registered.jwt)
                    assertThat(firstProfile.userId == registered.userId).isTrue()
                    assertThat(firstProfile.sign).isEqualTo("aries")
                    assertThat(firstProfile.language).isEqualTo("en")

                    stage("refresh")
                    val refreshedJwt = client.refresh(registered.jwt)
                    cleanupJwt = refreshedJwt
                    assertThat(refreshedJwt.isNotBlank()).isTrue()
                    val secondProfile = client.profile(refreshedJwt)
                    assertThat(secondProfile.userId == registered.userId).isTrue()
                    assertThat(secondProfile.sign).isEqualTo("aries")
                    assertThat(secondProfile.language).isEqualTo("en")

                    stage("delete")
                    val deleteResult = client.delete(refreshedJwt)
                    assertThat(deleteResult.ok).isTrue()
                    assertThat(deleteResult.firebaseAccountDeleted).isTrue()
                    backendDeleted = true

                    stage("post_delete")
                    assertThat(client.profileStatus(refreshedJwt)).isAnyOf(401, 404)
                }

            val cleanupFailure =
                cleanup(
                    client = client,
                    auth = auth,
                    installations = installations,
                    app = app,
                    user = firebaseUser,
                    firebaseToken = firebaseToken,
                    fid = fid,
                    cleanupJwt = cleanupJwt,
                    backendDeleted = backendDeleted,
                )
            lifecycleResult.exceptionOrNull()?.let { lifecycleFailure ->
                cleanupFailure?.let(lifecycleFailure::addSuppressed)
                throw lifecycleFailure
            }
            cleanupFailure?.let { throw it }
            reportPass()
        }

    private suspend fun cleanup(
        client: BackendSmokeClient,
        auth: FirebaseAuth,
        installations: FirebaseInstallations,
        app: FirebaseApp,
        user: FirebaseUser?,
        firebaseToken: String?,
        fid: String?,
        cleanupJwt: String?,
        backendDeleted: Boolean,
    ): Throwable? {
        stage("cleanup")
        val failures = mutableListOf<Throwable>()
        var accountDeleted = backendDeleted

        if (!accountDeleted) {
            val recoveredJwt =
                cleanupJwt
                    ?: recoverCleanupJwt(
                        client = client,
                        firebaseToken = firebaseToken,
                        fid = fid,
                    )
            if (recoveredJwt != null) {
                val deletion = runCatching { client.delete(recoveredJwt) }
                val result = deletion.getOrNull()
                accountDeleted = result?.ok == true && result.firebaseAccountDeleted
                if (!accountDeleted) {
                    failures += SmokeCleanupException("backend_delete", deletion.exceptionOrNull())
                }
            } else if (firebaseToken != null && fid != null) {
                failures += SmokeCleanupException("backend_session_recovery")
            }

            if (!accountDeleted && user != null) {
                runCatching { user.delete().await() }
                    .onFailure { failures += SmokeCleanupException("firebase_user_delete", it) }
            }
        }

        runCatching { installations.delete().await() }
            .onFailure { failures += SmokeCleanupException("installation_delete", it) }
        runCatching { auth.signOut() }
            .onFailure { failures += SmokeCleanupException("firebase_sign_out", it) }
        runCatching { app.delete() }
            .onFailure { failures += SmokeCleanupException("firebase_app_delete", it) }

        return failures.toCombinedFailure()
    }

    private suspend fun recoverCleanupJwt(
        client: BackendSmokeClient,
        firebaseToken: String?,
        fid: String?,
    ): String? {
        if (firebaseToken == null || fid == null) return null
        repeat(CLEANUP_REGISTER_ATTEMPTS) { attempt ->
            runCatching { client.register(firebaseIdToken = firebaseToken, fid = fid).jwt }
                .getOrNull()
                ?.takeIf(String::isNotBlank)
                ?.let { return it }
            delay(CLEANUP_RETRY_DELAY_MILLIS * (attempt + 1))
        }
        return null
    }

    private fun List<Throwable>.toCombinedFailure(): Throwable? {
        val primary = firstOrNull() ?: return null
        drop(1).forEach(primary::addSuppressed)
        return primary
    }

    private fun stage(name: String) {
        val status = Bundle().apply { putString("device_smoke_stage", name) }
        InstrumentationRegistry.getInstrumentation().sendStatus(0, status)
    }

    private fun reportPass() {
        val status = Bundle().apply { putString("device_smoke_result", "pass") }
        InstrumentationRegistry.getInstrumentation().sendStatus(0, status)
    }

    private class SmokeCleanupException(
        stage: String,
        cause: Throwable? = null,
    ) : IllegalStateException("cleanup_stage=$stage", cause)

    private companion object {
        const val CLEANUP_REGISTER_ATTEMPTS = 3
        const val CLEANUP_RETRY_DELAY_MILLIS = 250L
        val REQUIRED_ARGUMENTS =
            listOf(
                "firebaseApiKey",
                "firebaseAppId",
                "firebaseProjectId",
                "firebaseSenderId",
                "backendBaseUrl",
            )
    }
}
