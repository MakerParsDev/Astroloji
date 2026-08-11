package com.parsfilo.astrology.core.data.repository

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.ChatMessageResponse
import com.parsfilo.astrology.core.data.remote.DeepReadingResponse
import com.parsfilo.astrology.core.data.session.AuthenticatedRequestExecutor
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.DispatchersProvider
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class ReadingRepositoryTest {
    private val api = mockk<AstrologyApi>()
    private val sessionRepository = mockk<SessionRepository>()
    private val dispatcher = UnconfinedTestDispatcher()
    private val repository =
        ReadingRepository(
            api = api,
            sessionRepository = sessionRepository,
            requestExecutor = AuthenticatedRequestExecutor(),
            dispatchers =
                DispatchersProvider(
                    main = dispatcher,
                    io = dispatcher,
                    default = dispatcher,
                ),
        )

    @Test
    fun `deep reading returns the generated text`() =
        runTest {
            coEvery { api.getDeepReading(any()) } returns
                Response.success(DeepReadingResponse(text = "You are a deep soul.", cached = false, creditsSpent = 30))

            val result = repository.getDeepReading("en")

            assertThat(result).isInstanceOf(AppResult.Success::class.java)
            assertThat((result as AppResult.Success).data.text).isEqualTo("You are a deep soul.")
        }

    @Test
    fun `insufficient credits surfaces as a billing exception`() =
        runTest {
            coEvery { api.getDeepReading(any()) } returns
                Response.error(402, "Not enough credits.".toResponseBody())

            val result = repository.getDeepReading("en")

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat((result as AppResult.Error).exception).isInstanceOf(AppException.BillingException::class.java)
        }

    @Test
    fun `missing birth data surfaces as a network error explaining the precondition`() =
        runTest {
            coEvery { api.getDeepReading(any()) } returns
                Response.error(400, "Birth data is required.".toResponseBody())

            val result = repository.getDeepReading("en")

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat((result as AppResult.Error).exception.message)
                .isEqualTo("Birth data is required for this feature.")
        }

    @Test
    fun `chat message returns the reply and updated balance`() =
        runTest {
            coEvery { api.sendChatMessage(any()) } returns
                Response.success(ChatMessageResponse(reply = "The stars say yes.", balance = 15))

            val result = repository.sendChatMessage("en", "Should I take the job?", emptyList())

            assertThat(result).isInstanceOf(AppResult.Success::class.java)
            assertThat((result as AppResult.Success).data.balance).isEqualTo(15)
        }

    @Test
    fun `unauthorized chat responses surface as an unauthorized error`() =
        runTest {
            coEvery { api.sendChatMessage(any()) } returns Response.error(401, "unauthorized".toResponseBody())
            coEvery { sessionRepository.refreshAfterUnauthorized(null) } returns
                AppResult.Error(AppException.UnauthorizedException())

            val result = repository.sendChatMessage("en", "hi", emptyList())

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat((result as AppResult.Error).exception)
                .isInstanceOf(AppException.UnauthorizedException::class.java)
        }
}
