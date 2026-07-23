package com.parsfilo.astrology.core.data.session

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.util.Base64

class SessionTokenStoreTest {
    private val store = SessionTokenStore()

    @Test
    fun `currentUsable returns a token whose expiry is in the future`() {
        val token = jwt(exp = 2_000)
        store.update(token)
        assertThat(store.currentUsable(nowEpochSeconds = 1_000)).isEqualTo(token)
    }

    @Test
    fun `currentUsable rejects an expired token`() {
        store.update(jwt(exp = 1_000))
        assertThat(store.currentUsable(nowEpochSeconds = 1_000)).isNull()
    }

    @Test
    fun `currentUsable rejects malformed tokens`() {
        store.update("not-a-jwt")
        assertThat(store.currentUsable(nowEpochSeconds = 1_000)).isNull()
    }

    @Test
    fun `currentUsable rejects malformed base64url payloads`() {
        store.update("header.***.signature")
        assertThat(store.currentUsable(nowEpochSeconds = 1_000)).isNull()
    }

    @Test
    fun `currentUsable rejects a quoted expiry`() {
        store.update(jwtPayload("""{"exp":"2000"}"""))
        assertThat(store.currentUsable(nowEpochSeconds = 1_000)).isNull()
    }

    @Test
    fun `currentUsable ignores nested expiry values`() {
        store.update(jwtPayload("""{"claims":{"exp":2000}}"""))
        assertThat(store.currentUsable(nowEpochSeconds = 1_000)).isNull()
    }

    private fun jwt(exp: Long): String = jwtPayload("""{"exp":$exp}""")

    private fun jwtPayload(json: String): String {
        val payload = Base64.getUrlEncoder().withoutPadding().encodeToString(json.toByteArray())
        return "header.$payload.signature"
    }
}
