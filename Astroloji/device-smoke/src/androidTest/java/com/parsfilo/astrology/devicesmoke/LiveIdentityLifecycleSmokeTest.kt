package com.parsfilo.astrology.devicesmoke

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.truth.Truth.assertThat
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.installations.FirebaseInstallations
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
            var cleanupJwt: String? = null
            var deleted = false

            try {
                stage("anonymous_auth")
                val user = requireNotNull(auth.signInAnonymously().await().user)
                val firebaseToken = requireNotNull(user.getIdToken(true).await().token)
                assertThat(firebaseToken.isNotBlank()).isTrue()

                stage("fid")
                val fid = installations.id.await().trim()
                assertThat(fid.isNotBlank()).isTrue()

                stage("register")
                val registered = client.register(firebaseIdToken = firebaseToken, fid = fid)
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
                deleted = true

                stage("post_delete")
                assertThat(client.profileStatus(refreshedJwt)).isAnyOf(401, 404)
                println("DEVICE_SMOKE_PASS stages=anonymous_auth,fid,register,profile,refresh,delete,post_delete")
            } finally {
                if (!deleted) {
                    cleanupJwt?.let { jwt -> runCatching { client.delete(jwt) } }
                }
                runCatching { installations.delete().await() }
                auth.signOut()
                app.delete()
            }
        }

    private fun stage(name: String) {
        println("DEVICE_SMOKE_STAGE $name")
    }

    private companion object {
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
