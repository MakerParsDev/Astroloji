package com.parsfilo.astrology.devicesmoke

class SmokeArguments private constructor(
    val firebaseApiKey: String,
    val firebaseAppId: String,
    val firebaseProjectId: String,
    val firebaseSenderId: String,
    val backendBaseUrl: String,
) {
    override fun toString(): String =
        "SmokeArguments(firebaseApiKey=<redacted>, firebaseAppId=<redacted>, " +
            "firebaseProjectId=<redacted>, firebaseSenderId=<redacted>, backendBaseUrl=$backendBaseUrl)"

    companion object {
        private const val PRODUCTION_BACKEND = "https://astrology.parsfilo.com"
        private const val MAX_API_KEY_LENGTH = 128
        private const val MAX_APP_ID_LENGTH = 128
        private const val MAX_PROJECT_ID_LENGTH = 128
        private const val MAX_SENDER_ID_LENGTH = 32
        private const val MAX_BACKEND_URL_LENGTH = 128

        fun from(values: Map<String, String>): SmokeArguments {
            val apiKey = values.requiredBounded("firebaseApiKey", MAX_API_KEY_LENGTH)
            val appId = values.requiredBounded("firebaseAppId", MAX_APP_ID_LENGTH)
            val projectId = values.requiredBounded("firebaseProjectId", MAX_PROJECT_ID_LENGTH)
            val senderId = values.requiredBounded("firebaseSenderId", MAX_SENDER_ID_LENGTH)
            val backendBaseUrl = values.requiredBounded("backendBaseUrl", MAX_BACKEND_URL_LENGTH)
            require(backendBaseUrl == PRODUCTION_BACKEND) {
                "backendBaseUrl must use the production backend."
            }
            return SmokeArguments(
                firebaseApiKey = apiKey,
                firebaseAppId = appId,
                firebaseProjectId = projectId,
                firebaseSenderId = senderId,
                backendBaseUrl = backendBaseUrl,
            )
        }

        private fun Map<String, String>.requiredBounded(
            key: String,
            maximumLength: Int,
        ): String {
            val value = get(key)?.trim().orEmpty()
            require(value.isNotEmpty()) { "$key is required." }
            require(value.length <= maximumLength) { "$key exceeds $maximumLength characters." }
            return value
        }
    }
}
