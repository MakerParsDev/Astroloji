package com.parsfilo.astrology.devicesmoke

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.Assert.assertThrows
import org.junit.Test

class BackendSmokeClientTest {
    @Test
    fun registerSendsFirebaseTokenAndInstallationId() {
        lateinit var captured: Request
        val client =
            BackendSmokeClient(
                baseUrl = "https://astrology.parsfilo.com",
                client =
                    clientReturning(
                        code = 200,
                        body =
                            """
                            {"user_id":"opaque-user","jwt":"backend-jwt","is_premium":false,"subscription_state":"none"}
                            """.trimIndent(),
                    ) { captured = it },
            )

        val registered = client.register(firebaseIdToken = "firebase-token", fid = "fid-value")

        assertThat(registered.userId).isEqualTo("opaque-user")
        assertThat(registered.jwt).isEqualTo("backend-jwt")
        assertThat(captured.method).isEqualTo("POST")
        assertThat(captured.url.encodedPath).isEqualTo("/api/v1/users/register")
        assertThat(captured.header("Authorization")).isEqualTo("Bearer firebase-token")
        val body = Json.parseToJsonElement(captured.bodyText()).jsonObject
        assertThat(body.getValue("sign").jsonPrimitive.content).isEqualTo("aries")
        assertThat(body.getValue("language").jsonPrimitive.content).isEqualTo("en")
        assertThat(body.getValue("firebase_installation_id").jsonPrimitive.content).isEqualTo("fid-value")
        assertThat(body.getValue("platform").jsonPrimitive.content).isEqualTo("android")
        assertThat(body.getValue("notification_hour").jsonPrimitive.content).isEqualTo("9")
        assertThat(body.getValue("utc_offset").jsonPrimitive.content).isEqualTo("0")
    }

    @Test
    fun profileRefreshAndDeleteUseBackendJwt() {
        val captured = mutableListOf<Request>()
        val responses =
            ArrayDeque(
                listOf(
                    """
                    {"user_id":"opaque-user","sign":"aries","language":"en","is_premium":false,
                    "notification_enabled":true,"notification_hour":9,"utc_offset":0}
                    """.trimIndent().replace("\n", ""),
                    """{"jwt":"refreshed-jwt","is_premium":false,"subscription_state":"none"}""",
                    """{"ok":true,"user_id":"opaque-user","firebase_account_deleted":true}""",
                ),
            )
        val client =
            BackendSmokeClient(
                baseUrl = "https://astrology.parsfilo.com",
                client =
                    clientReturning { request ->
                        captured += request
                        responses.removeFirst()
                    },
            )

        val profile = client.profile("first-jwt")
        val refreshed = client.refresh("first-jwt")
        val deleted = client.delete(refreshed)

        assertThat(profile.sign).isEqualTo("aries")
        assertThat(profile.language).isEqualTo("en")
        assertThat(refreshed).isEqualTo("refreshed-jwt")
        assertThat(deleted.ok).isTrue()
        assertThat(deleted.firebaseAccountDeleted).isTrue()
        assertThat(captured.map { it.method }).containsExactly("GET", "POST", "DELETE").inOrder()
        assertThat(captured.map { it.url.encodedPath })
            .containsExactly("/api/v1/users/me", "/api/v1/users/refresh-token", "/api/v1/users/me")
            .inOrder()
        assertThat(captured.map { it.header("Authorization") })
            .containsExactly("Bearer first-jwt", "Bearer first-jwt", "Bearer refreshed-jwt")
            .inOrder()
    }

    @Test
    fun trackEventStatusUsesWriteEndpointWithBackendJwt() {
        lateinit var captured: Request
        val client =
            BackendSmokeClient(
                baseUrl = "https://astrology.parsfilo.com",
                client = clientReturning(code = 401, body = "{}") { captured = it },
            )

        val dummyJwt = "deleted-user-jwt"
        val status = client.status(dummyJwt, SmokeStatusEndpoint.TRACK_EVENT)

        assertThat(status).isEqualTo(401)
        assertThat(captured.method).isEqualTo("POST")
        assertThat(captured.url.encodedPath).isEqualTo("/api/v1/events/track")
        assertThat(captured.header("Authorization")).isEqualTo("Bearer $dummyJwt")
        val body = Json.parseToJsonElement(captured.bodyText()).jsonObject
        assertThat(body.getValue("event_type").jsonPrimitive.content).isEqualTo("app_open")
        assertThat(body.getValue("meta").jsonObject).isEmpty()
    }

    @Test
    fun unexpectedStatusDoesNotExposeResponseBody() {
        val client =
            BackendSmokeClient(
                baseUrl = "https://astrology.parsfilo.com",
                client = clientReturning(code = 500, body = "super-secret-response"),
            )

        val error = assertThrows(SmokeStageException::class.java) { client.profile("backend-jwt") }

        assertThat(error.stage).isEqualTo("profile")
        assertThat(error.statusCode).isEqualTo(500)
        assertThat(error).hasMessageThat().doesNotContain("super-secret-response")
        assertThat(error).hasMessageThat().doesNotContain("backend-jwt")
    }

    private fun clientReturning(
        code: Int = 200,
        body: String,
        capture: (Request) -> Unit = {},
    ): OkHttpClient =
        OkHttpClient
            .Builder()
            .addInterceptor(
                Interceptor { chain ->
                    val request = chain.request()
                    capture(request)
                    response(request, code, body)
                },
            ).build()

    private fun clientReturning(
        captureAndBody: (Request) -> String,
    ): OkHttpClient =
        OkHttpClient
            .Builder()
            .addInterceptor(
                Interceptor { chain ->
                    val request = chain.request()
                    response(request, 200, captureAndBody(request))
                },
            ).build()

    private fun response(
        request: Request,
        code: Int,
        body: String,
    ): Response =
        Response
            .Builder()
            .request(request)
            .protocol(Protocol.HTTP_1_1)
            .code(code)
            .message("test")
            .body(body.toResponseBody("application/json".toMediaType()))
            .build()

    private fun Request.bodyText(): String {
        val buffer = Buffer()
        body?.writeTo(buffer)
        return buffer.readUtf8()
    }
}
