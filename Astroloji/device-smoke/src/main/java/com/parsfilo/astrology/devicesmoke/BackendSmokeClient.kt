package com.parsfilo.astrology.devicesmoke

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

private const val DEFAULT_NOTIFICATION_HOUR = 9
private const val DEFAULT_UTC_OFFSET = 0
private const val CALL_TIMEOUT_SECONDS = 20L
private const val SUCCESS_STATUS_CODE = 200

class SmokeStageException(
    val stage: String,
    val statusCode: Int,
    cause: Throwable? = null,
) : IllegalStateException("stage=$stage status=$statusCode", cause)

@Serializable
data class RegisteredIdentity(
    @SerialName("user_id") val userId: String,
    val jwt: String,
)

@Serializable
data class ProfileSnapshot(
    @SerialName("user_id") val userId: String,
    val sign: String,
    val language: String,
)

@Serializable
data class DeleteSnapshot(
    val ok: Boolean,
    @SerialName("firebase_account_deleted") val firebaseAccountDeleted: Boolean,
)

@Serializable
private data class RegisterRequest(
    val sign: String = "aries",
    val language: String = "en",
    @SerialName("firebase_installation_id") val firebaseInstallationId: String,
    @SerialName("notification_hour") val notificationHour: Int = DEFAULT_NOTIFICATION_HOUR,
    @SerialName("utc_offset") val utcOffset: Int = DEFAULT_UTC_OFFSET,
    val platform: String = "android",
)

@Serializable
private data class RefreshResponse(
    val jwt: String,
)

class BackendSmokeClient(
    baseUrl: String,
    private val client: OkHttpClient =
        OkHttpClient
            .Builder()
            .callTimeout(CALL_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .build(),
) {
    private val root = baseUrl.trimEnd('/')
    private val json =
        Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
        }

    fun register(
        firebaseIdToken: String,
        fid: String,
    ): RegisteredIdentity {
        val request =
            Request
                .Builder()
                .url("$root/api/v1/users/register")
                .header("Authorization", "Bearer $firebaseIdToken")
                .post(json.encodeToString(RegisterRequest(firebaseInstallationId = fid)).jsonBody())
                .build()
        return execute("register", request) { body ->
            json.decodeFromString<RegisteredIdentity>(body).validated("register")
        }
    }

    fun profile(jwt: String): ProfileSnapshot {
        val request =
            Request
                .Builder()
                .url("$root/api/v1/users/me")
                .header("Authorization", "Bearer $jwt")
                .get()
                .build()
        return execute("profile", request) { body ->
            json.decodeFromString<ProfileSnapshot>(body).validated("profile")
        }
    }

    fun refresh(jwt: String): String {
        val request =
            Request
                .Builder()
                .url("$root/api/v1/users/refresh-token")
                .header("Authorization", "Bearer $jwt")
                .post("{}".jsonBody())
                .build()
        return execute("refresh", request) { body ->
            json
                .decodeFromString<RefreshResponse>(body)
                .jwt
                .trim()
                .takeIf(String::isNotEmpty)
                ?: throw SmokeStageException("refresh", SUCCESS_STATUS_CODE)
        }
    }

    fun delete(jwt: String): DeleteSnapshot {
        val request =
            Request
                .Builder()
                .url("$root/api/v1/users/me")
                .header("Authorization", "Bearer $jwt")
                .delete()
                .build()
        return execute("delete", request) { body ->
            json.decodeFromString<DeleteSnapshot>(body)
        }
    }

    fun profileStatus(jwt: String): Int {
        val request =
            Request
                .Builder()
                .url("$root/api/v1/users/me")
                .header("Authorization", "Bearer $jwt")
                .get()
                .build()
        return client.newCall(request).execute().use { it.code }
    }

    private fun <T> execute(
        stage: String,
        request: Request,
        decode: (String) -> T,
    ): T =
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw SmokeStageException(stage, response.code)
            }
            val body = response.body.string()
            try {
                decode(body)
            } catch (error: SmokeStageException) {
                throw error
            } catch (error: SerializationException) {
                throw SmokeStageException(stage, response.code, error)
            }
        }

    private fun String.jsonBody() = toRequestBody(JSON_MEDIA_TYPE)

    private fun RegisteredIdentity.validated(stage: String): RegisteredIdentity {
        if (userId.isBlank() || jwt.isBlank()) throw SmokeStageException(stage, SUCCESS_STATUS_CODE)
        return this
    }

    private fun ProfileSnapshot.validated(stage: String): ProfileSnapshot {
        val hasMissingField = userId.isBlank() || sign.isBlank() || language.isBlank()
        if (hasMissingField) throw SmokeStageException(stage, SUCCESS_STATUS_CODE)
        return this
    }

    private companion object {
        val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
    }
}
