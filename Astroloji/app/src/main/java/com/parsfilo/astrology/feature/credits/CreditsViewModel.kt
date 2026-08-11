package com.parsfilo.astrology.feature.credits

import android.app.Activity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.BillingManager
import com.parsfilo.astrology.core.data.repository.CreditCatalogueLoadResult
import com.parsfilo.astrology.core.data.repository.CreditPackUi
import com.parsfilo.astrology.core.data.repository.CreditsRepository
import com.parsfilo.astrology.core.data.repository.RemoteConfigRepository
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.BillingFailureReason
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class CreditsUiState(
    val isLoading: Boolean = true,
    val packs: List<CreditPackUi> = emptyList(),
    val balance: Int? = null,
    val isPurchasing: Boolean = false,
    val error: String? = null,
    val purchaseSuccessCredits: Int? = null,
)

sealed interface CreditsUiEvent {
    data class Purchase(
        val activity: Activity,
        val productId: String,
    ) : CreditsUiEvent

    data object RetryCatalogue : CreditsUiEvent

    data object DismissMessages : CreditsUiEvent
}

@HiltViewModel
class CreditsViewModel
    @Inject
    constructor(
        private val billingManager: BillingManager,
        private val creditsRepository: CreditsRepository,
        private val analyticsRepository: AnalyticsRepository,
        private val remoteConfigRepository: RemoteConfigRepository,
    ) : ViewModel() {
        private val _uiState = MutableStateFlow(CreditsUiState())
        val uiState: StateFlow<CreditsUiState> = _uiState.asStateFlow()
        private var creditPackVisibility: Boolean = true

        init {
            billingManager.clearCreditPurchaseState()
            viewModelScope.launch {
                creditPackVisibility = remoteConfigRepository.fetchFlags().creditPackVisibility
                loadCatalogue()
            }
            loadBalance()
            viewModelScope.launch {
                billingManager.creditPurchaseState.collectLatest { purchaseState ->
                    when (purchaseState) {
                        is AppResult.Success -> {
                            _uiState.update {
                                it.copy(
                                    isPurchasing = false,
                                    error = null,
                                    balance = purchaseState.data.balance,
                                    purchaseSuccessCredits = purchaseState.data.creditsGranted,
                                )
                            }
                            viewModelScope.launch {
                                analyticsRepository.track(
                                    AnalyticsEvents.CREDIT_PURCHASED,
                                    mapOf("credits" to purchaseState.data.creditsGranted.toString()),
                                )
                            }
                        }
                        is AppResult.Error -> {
                            val billingException = purchaseState.exception as? AppException.BillingException
                            val isCancelled = billingException?.reason == BillingFailureReason.USER_CANCELLED
                            _uiState.update {
                                it.copy(
                                    isPurchasing = false,
                                    error = purchaseState.exception.message.takeUnless { isCancelled },
                                )
                            }
                        }
                        AppResult.Loading -> _uiState.update { it.copy(isPurchasing = true, error = null) }
                        null -> Unit
                    }
                }
            }
        }

        fun onEvent(event: CreditsUiEvent) {
            when (event) {
                is CreditsUiEvent.Purchase -> {
                    billingManager.clearCreditPurchaseState()
                    _uiState.update { it.copy(purchaseSuccessCredits = null, error = null) }
                    billingManager.launchCreditPurchase(event.activity, event.productId)
                }
                CreditsUiEvent.RetryCatalogue -> loadCatalogue()
                CreditsUiEvent.DismissMessages ->
                    _uiState.update { it.copy(error = null, purchaseSuccessCredits = null) }
            }
        }

        private fun loadCatalogue() {
            viewModelScope.launch {
                _uiState.update { it.copy(isLoading = true, error = null) }
                if (!creditPackVisibility) {
                    _uiState.update { it.copy(isLoading = false, packs = emptyList(), error = null) }
                    return@launch
                }
                when (val result = billingManager.loadCreditPacks()) {
                    is CreditCatalogueLoadResult.Success ->
                        _uiState.update { it.copy(isLoading = false, packs = result.packs) }
                    is CreditCatalogueLoadResult.Failure ->
                        _uiState.update { it.copy(isLoading = false, packs = emptyList(), error = result.message) }
                }
            }
        }

        private fun loadBalance() {
            viewModelScope.launch {
                when (val result = creditsRepository.getBalance()) {
                    is AppResult.Success -> _uiState.update { it.copy(balance = result.data.balance) }
                    is AppResult.Error, AppResult.Loading -> Unit
                }
            }
        }
    }
