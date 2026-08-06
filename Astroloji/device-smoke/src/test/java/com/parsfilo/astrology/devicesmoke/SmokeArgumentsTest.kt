package com.parsfilo.astrology.devicesmoke

import com.google.common.truth.Truth.assertThat
import org.junit.Assert.assertThrows
import org.junit.Test

class SmokeArgumentsTest {
    private val valid =
        mapOf(
            "firebaseApiKey" to "api-key-value",
            "firebaseAppId" to "1:1234567890:android:abcdef",
            "firebaseProjectId" to "astrology-project",
            "firebaseSenderId" to "1234567890",
            "backendBaseUrl" to "https://astrology.parsfilo.com",
        )

    @Test
    fun validArgumentsAreAcceptedWithoutLeakingValues() {
        val arguments = SmokeArguments.from(valid)

        assertThat(arguments.backendBaseUrl).isEqualTo("https://astrology.parsfilo.com")
        assertThat(arguments.toString()).doesNotContain("api-key-value")
        assertThat(arguments.toString()).doesNotContain("astrology-project")
        assertThat(arguments.toString()).contains("redacted")
    }

    @Test
    fun missingArgumentIsRejected() {
        val error =
            assertThrows(IllegalArgumentException::class.java) {
                SmokeArguments.from(valid - "firebaseApiKey")
            }

        assertThat(error).hasMessageThat().contains("firebaseApiKey")
    }

    @Test
    fun nonProductionBackendIsRejected() {
        val error =
            assertThrows(IllegalArgumentException::class.java) {
                SmokeArguments.from(valid + ("backendBaseUrl" to "https://example.com"))
            }

        assertThat(error).hasMessageThat().contains("production backend")
    }

    @Test
    fun oversizedArgumentIsRejected() {
        val error =
            assertThrows(IllegalArgumentException::class.java) {
                SmokeArguments.from(valid + ("firebaseProjectId" to "x".repeat(129)))
            }

        assertThat(error).hasMessageThat().contains("firebaseProjectId")
    }
}
