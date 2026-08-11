package com.parsfilo.astrology.feature.credits

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.data.remote.CreditBalanceResponse
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.BillingManager
import com.parsfilo.astrology.core.data.repository.CreditCatalogueLoadResult
import com.parsfilo.astrology.core.data.repository.CreditPackUi
import com.parsfilo.astrology.core.data.repository.CreditPurchaseResult
import com.parsfilo.astrology.core.data.repository.CreditsRepository
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import io.mockk.coEvery
import io.mockk.coJustRun
import io.mockk.coVerify
import io.mockk.every
import io.mockk.justRun
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CreditsViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val billingManager = mockk<BillingManager>()
    private val creditsRepository = mockk<CreditsRepository>()
    private val analyticsRepository = mockk<AnalyticsRepository>()
    private val purchaseState = MutableStateFlow<AppResult<CreditPurchaseResult>?>(null)

    private fun stubDependencies(
        catalogue: CreditCatalogueLoadResult =
            CreditCatalogueLoadResult.Success(
                listOf(CreditPackUi(productId = "credits_small", title = "Small", price = "$2.99", credits = 20)),
            ),
        balance: AppResult<CreditBalanceResponse> = AppResult.Success(CreditBalanceResponse(balance = 5)),
    ) {
        every { billingManager.creditPurchaseState } returns purchaseState.asStateFlow()
        justRun { billingManager.clearCreditPurchaseState() }
        coEvery { billingManager.loadCreditPacks() } returns catalogue
        coEvery { creditsRepository.getBalance() } returns balance
        coJustRun { analyticsRepository.track(any(), any()) }
    }

    private fun createViewModel(): CreditsViewModel =
        CreditsViewModel(
            billingManager = billingManager,
            creditsRepository = creditsRepository,
            analyticsRepository = analyticsRepository,
        )

    @Test
    fun `loads the pack catalogue and balance on init`() =
        runTest {
            stubDependencies()

            val viewModel = createViewModel()
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.isLoading).isFalse()
            assertThat(viewModel.uiState.value.packs).hasSize(1)
            assertThat(viewModel.uiState.value.balance).isEqualTo(5)
        }

    @Test
    fun `a catalogue load failure surfaces the error and empties the pack list`() =
        runTest {
            stubDependencies(catalogue = CreditCatalogueLoadResult.Failure("Catalogue unavailable."))

            val viewModel = createViewModel()
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.packs).isEmpty()
            assertThat(viewModel.uiState.value.error).isEqualTo("Catalogue unavailable.")
        }

    @Test
    fun `a successful purchase updates balance and fires credit purchased analytics`() =
        runTest {
            stubDependencies()
            val viewModel = createViewModel()
            advanceUntilIdle()

            purchaseState.value = AppResult.Success(CreditPurchaseResult(creditsGranted = 20, balance = 25))
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.balance).isEqualTo(25)
            assertThat(viewModel.uiState.value.purchaseSuccessCredits).isEqualTo(20)
            coVerify(exactly = 1) {
                analyticsRepository.track(AnalyticsEvents.CREDIT_PURCHASED, mapOf("credits" to "20"))
            }
        }

    @Test
    fun `a failed purchase surfaces the error message`() =
        runTest {
            stubDependencies()
            val viewModel = createViewModel()
            advanceUntilIdle()

            purchaseState.value = AppResult.Error(AppException.BillingException("Purchase failed."))
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.isPurchasing).isFalse()
            assertThat(viewModel.uiState.value.error).isEqualTo("Purchase failed.")
        }
}
