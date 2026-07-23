package com.parsfilo.astrology.core.data.session

import java.nio.charset.StandardCharsets
import java.util.Base64
import java.util.concurrent.atomic.AtomicReference
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SessionTokenStore
    @Inject
    constructor() {
        private val token = AtomicReference<String?>(null)

        fun current(): String? = token.get()

        fun currentUsable(
            nowEpochSeconds: Long = System.currentTimeMillis() / MILLIS_PER_SECOND,
        ): String? = current()?.takeIf { jwt -> jwtExpiry(jwt)?.let { it > nowEpochSeconds } == true }

        fun update(jwt: String?) {
            token.set(jwt?.trim()?.takeIf { it.isNotEmpty() })
        }

        private fun jwtExpiry(jwt: String): Long? =
            runCatching {
                val parts = jwt.split('.')
                if (parts.size != JWT_PART_COUNT) return null
                val payload =
                    String(
                        Base64.getUrlDecoder().decode(padBase64(parts[JWT_PAYLOAD_INDEX])),
                        StandardCharsets.UTF_8,
                    )
                EXPIRY_PATTERN
                    .find(payload)
                    ?.groupValues
                    ?.get(EXPIRY_GROUP_INDEX)
                    ?.toLongOrNull()
            }.getOrNull()

        private fun padBase64(value: String): String =
            value +
                "=".repeat(
                    (BASE64_BLOCK_SIZE - value.length % BASE64_BLOCK_SIZE) % BASE64_BLOCK_SIZE,
                )

        private companion object {
            const val MILLIS_PER_SECOND = 1_000L
            const val JWT_PART_COUNT = 3
            const val JWT_PAYLOAD_INDEX = 1
            const val EXPIRY_GROUP_INDEX = 1
            const val BASE64_BLOCK_SIZE = 4
            val EXPIRY_PATTERN = Regex("\\\"exp\\\"\\s*:\\s*(\\d+)")
        }
    }
