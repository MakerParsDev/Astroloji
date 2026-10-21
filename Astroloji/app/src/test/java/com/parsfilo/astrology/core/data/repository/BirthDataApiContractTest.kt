package com.parsfilo.astrology.core.data.repository

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/** Exercises Retrofit's actual JSON conversion for the existing birth-data DELETE contract. */
class BirthDataApiContractTest {
    @Test
    fun `delete sends correct path and consumes backend 200 JSON body`() =
        runTest {
            var method: String? = null
            var path: String? = null
            val client =
                OkHttpClient
                    .Builder()
                    .addInterceptor { chain ->
                        method = chain.request().method
                        path = chain.request().url.encodedPath
                        okhttp3.Response
                            .Builder()
                            .request(chain.request())
                            .protocol(Protocol.HTTP_1_1)
                            .code(200)
                            .message("OK")
                            .body("""{"ok":true}""".toResponseBody("application/json".toMediaType()))
                            .build()
                    }.build()
            val api =
                Retrofit
                    .Builder()
                    .baseUrl("https://example.invalid/")
                    .client(client)
                    .addConverterFactory(
                        Json.Default.asConverterFactory("application/json".toMediaType()),
                    ).build()
                    .create(AstrologyApi::class.java)

            val result = api.deleteBirthData()

            assertThat(method).isEqualTo("DELETE")
            assertThat(path).isEqualTo("/api/v1/users/me/birth-data")
            assertThat(result.isSuccessful).isTrue()
            assertThat(result.code()).isEqualTo(200)
        }
}
