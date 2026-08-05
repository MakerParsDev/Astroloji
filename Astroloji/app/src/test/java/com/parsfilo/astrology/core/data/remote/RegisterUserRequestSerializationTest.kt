package com.parsfilo.astrology.core.data.remote

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.di.AppModules
import kotlinx.serialization.encodeToString
import org.junit.Test

class RegisterUserRequestSerializationTest {
    private val json = AppModules.provideJson()

    @Test
    fun `omits the installation ID field when no real token is available`() {
        val payload =
            json.encodeToString(
                RegisterUserRequest(
                    sign = "aries",
                    language = "tr",
                    firebaseInstallationId = null,
                    notificationHour = 9,
                    utcOffset = 3,
                ),
            )

        assertThat(payload).doesNotContain("firebase_installation_id")
    }

    @Test
    fun `includes the installation ID field when a real token is available`() {
        val payload =
            json.encodeToString(
                RegisterUserRequest(
                    sign = "aries",
                    language = "tr",
                    firebaseInstallationId = "fid-123",
                    notificationHour = 9,
                    utcOffset = 3,
                ),
            )

        assertThat(payload).contains("\"firebase_installation_id\":\"fid-123\"")
    }
}
