package com.parsfilo.astrology.core.data.repository

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.CreditBalanceResponse
import com.parsfilo.astrology.core.data.remote.SpendCreditsResponse
import com.parsfilo.astrology.core.data.remote.VerifyCreditPurchaseResponse
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
class CreditsRepositoryTest {
    private val api = mockk<AstrologyApi>()
    private val sessionRepository = mockk<SessionRepository>()
    private val dispatcher = UnconfinedTestDispatcher()
    private val repository =
        CreditsRepository(
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
    fun `verifying a purchase returns the granted balance`() =
        runTest {
            coEvery { api.verifyCreditPurchase(any()) } returns
                Response.success(VerifyCreditPurchaseResponse(ok = true, creditsGranted = 60, balance = 60))

            val result = repository.verifyPurchase("token-1", "credits_medium")

            assertThat(result).isInstanceOf(AppResult.Success::class.java)
            assertThat((result as AppResult.Success).data.balance).isEqualTo(60)
        }

    @Test
    fun `spending more than the balance surfaces a billing exception`() =
        runTest {
            coEvery { api.spendCredits(any()) } returns Response.error(402, "Insufficient credits.".toResponseBody())

            val result = repository.spend(amount = 30, feature = "deep_reading")

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat((result as AppResult.Error).exception).isInstanceOf(AppException.BillingException::class.java)
        }

    @Test
    fun `spending credits returns the remaining balance`() =
        runTest {
            coEvery { api.spendCredits(any()) } returns Response.success(SpendCreditsResponse(ok = true, balance = 10))

            val result = repository.spend(amount = 5, feature = "chat_consultation")

            assertThat(result).isInstanceOf(AppResult.Success::class.java)
            assertThat((result as AppResult.Success).data.balance).isEqualTo(10)
        }

    @Test
    fun `balance lookup unwraps the response`() =
        runTest {
            coEvery { api.getCreditBalance() } returns Response.success(CreditBalanceResponse(balance = 42))

            val result = repository.getBalance()

            assertThat(result).isInstanceOf(AppResult.Success::class.java)
            assertThat((result as AppResult.Success).data.balance).isEqualTo(42)
        }

    @Test
    fun `unauthorized balance responses surface as an unauthorized error`() =
        runTest {
            coEvery { api.getCreditBalance() } returns Response.error(401, "unauthorized".toResponseBody())
            coEvery { sessionRepository.refreshAfterUnauthorized(null) } returns
                AppResult.Error(AppException.UnauthorizedException())

            val result = repository.getBalance()

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat((result as AppResult.Error).exception)
                .isInstanceOf(AppException.UnauthorizedException::class.java)
        }
}
