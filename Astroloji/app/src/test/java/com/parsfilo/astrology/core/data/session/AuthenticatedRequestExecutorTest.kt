package com.parsfilo.astrology.core.data.session

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.Response

class AuthenticatedRequestExecutorTest {
    private val executor = AuthenticatedRequestExecutor()

    @Test
    fun `non unauthorized response is returned without refresh`() =
        kotlinx.coroutines.test.runTest {
            val success = response(code = 200)
            var requestCalls = 0
            var refreshCalls = 0

            val result =
                executor.execute(
                    request = {
                        requestCalls += 1
                        success
                    },
                    refreshAfterUnauthorized = {
                        refreshCalls += 1
                        AppResult.Success("fresh-token")
                    },
                )

            assertThat(result).isSameInstanceAs(success)
            assertThat(requestCalls).isEqualTo(1)
            assertThat(refreshCalls).isEqualTo(0)
        }

    @Test
    fun `unauthorized response refreshes with rejected bearer and retries once`() =
        kotlinx.coroutines.test.runTest {
            val unauthorized = response(code = 401, bearer = "rejected-token")
            val success = response(code = 200, bearer = "fresh-token")
            val responses = ArrayDeque(listOf(unauthorized, success))
            var requestCalls = 0
            var refreshCalls = 0
            var rejectedToken: String? = null

            val result =
                executor.execute(
                    request = {
                        requestCalls += 1
                        responses.removeFirst()
                    },
                    refreshAfterUnauthorized = {
                        refreshCalls += 1
                        rejectedToken = it
                        AppResult.Success("fresh-token")
                    },
                )

            assertThat(result).isSameInstanceAs(success)
            assertThat(requestCalls).isEqualTo(2)
            assertThat(refreshCalls).isEqualTo(1)
            assertThat(rejectedToken).isEqualTo("rejected-token")
        }

    @Test
    fun `refresh failure returns first unauthorized response without retry`() =
        kotlinx.coroutines.test.runTest {
            val unauthorized = response(code = 401, bearer = "rejected-token")
            var requestCalls = 0

            val result =
                executor.execute(
                    request = {
                        requestCalls += 1
                        unauthorized
                    },
                    refreshAfterUnauthorized = {
                        AppResult.Error(AppException.UnauthorizedException())
                    },
                )

            assertThat(result).isSameInstanceAs(unauthorized)
            assertThat(requestCalls).isEqualTo(1)
        }

    @Test
    fun `second unauthorized response invalidates the recovered session`() =
        kotlinx.coroutines.test.runTest {
            val first = response(code = 401, bearer = "rejected-token")
            val second = response(code = 401, bearer = "fresh-token")
            val responses = ArrayDeque(listOf(first, second))
            var invalidations = 0

            executor.execute(
                request = { responses.removeFirst() },
                refreshAfterUnauthorized = { AppResult.Success("fresh-token") },
                onUnauthorizedAfterRetry = { invalidations += 1 },
            )

            assertThat(invalidations).isEqualTo(1)
        }

    @Test
    fun `second unauthorized response is returned without a third request`() =
        kotlinx.coroutines.test.runTest {
            val first = response(code = 401, bearer = "rejected-token")
            val second = response(code = 401, bearer = "fresh-token")
            val responses = ArrayDeque(listOf(first, second))
            var requestCalls = 0
            var refreshCalls = 0

            val result =
                executor.execute(
                    request = {
                        requestCalls += 1
                        responses.removeFirst()
                    },
                    refreshAfterUnauthorized = {
                        refreshCalls += 1
                        AppResult.Success("fresh-token")
                    },
                )

            assertThat(result).isSameInstanceAs(second)
            assertThat(requestCalls).isEqualTo(2)
            assertThat(refreshCalls).isEqualTo(1)
        }

    private fun response(
        code: Int,
        bearer: String? = null,
    ): Response<String> {
        val request =
            Request
                .Builder()
                .url("https://example.com/test")
                .apply {
                    bearer?.let { header("Authorization", "Bearer $it") }
                }.build()
        val raw =
            okhttp3.Response
                .Builder()
                .request(request)
                .protocol(Protocol.HTTP_1_1)
                .code(code)
                .message(if (code == 200) "OK" else "Unauthorized")
                .build()
        return if (code in 200..299) {
            Response.success("ok", raw)
        } else {
            Response.error(
                "{}".toResponseBody("application/json".toMediaType()),
                raw,
            )
        }
    }
}
