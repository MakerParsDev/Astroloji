package com.parsfilo.astrology.core.data.remote

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.di.AppModules
import kotlinx.serialization.encodeToString
import org.junit.Test

class RegisterUserRequestSerializationTest {
    private val json = AppModules.provideJson()

    @Test
    fun `omits the FCM field when no real token is available`() {
        val payload =
            json.encodeToString(
                RegisterUserRequest(
                    sign = "aries",
                    language = "tr",
                    fcmToken = null,
                    notificationHour = 9,
                    utcOffset = 3,
                ),
            )

        assertThat(payload).doesNotContain("fcm_token")
    }

    @Test
    fun `includes the FCM field when a real token is available`() {
        val payload =
            json.encodeToString(
                RegisterUserRequest(
                    sign = "aries",
                    language = "tr",
                    fcmToken = "real-token",
                    notificationHour = 9,
                    utcOffset = 3,
                ),
            )

        assertThat(payload).contains("\"fcm_token\":\"real-token\"")
    }
}
