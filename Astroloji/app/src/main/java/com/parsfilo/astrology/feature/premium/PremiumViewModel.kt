package com.parsfilo.astrology.feature.premium

import android.app.Activity
import androidx.lifecycle.viewModelScope
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.BillingManager
import com.parsfilo.astrology.core.data.repository.PremiumPlanUi
import com.parsfilo.astrology.core.data.repository.RemoteConfigRepository
import com.parsfilo.astrology.core.ui.MviViewModel
import com.parsfilo.astrology.core.util.AppResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import timber.log.Timber
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject

data class PremiumUiState(
    val isLoading: Boolean = true,
    val plans: List<PremiumPlanUi> = emptyList(),
    val selectedPlanId: String = "",
    val trialDays: Int = 0,
    val isAlreadyPremium: Boolean = false,
    val premiumExpiresAt: String? = null,
    val yearlySavingsPercent: Int = 0,
    val error: String? = null,
    val purchaseSuccess: Boolean = false,
)

sealed interface PremiumUiEvent {
    data class SelectPlan(
        val planId: String,
    ) : PremiumUiEvent

    data class Purchase(
        val activity: Activity,
    ) : PremiumUiEvent

    data object Restore : PremiumUiEvent

    data object DismissSuccess : PremiumUiEvent
}

@HiltViewModel
class PremiumViewModel
    @Inject
    constructor(
        private val billingManager: BillingManager,
        private val analyticsRepository: AnalyticsRepository,
        private val remoteConfigRepository: RemoteConfigRepository,
        private val preferencesRepository: UserPreferencesRepository,
    ) : MviViewModel<PremiumUiState, PremiumUiEvent, Unit>(PremiumUiState()) {
        private var merchandisingTrialDays: Int = 0

        init {
            viewModelScope.launch {
                analyticsRepository.track(AnalyticsEvents.PREMIUM_SCREEN_VIEWED)
                billingManager.clearPurchaseState()
                val preferences = preferencesRepository.current()
                val flags = remoteConfigRepository.fetchFlags()
                merchandisingTrialDays = flags.premiumTrialDays
                billingManager.loadPlans()
                val plans = billingManager.plans.value
                val selectedPlan = plans.firstOrNull()
                setState {
                    copy(
                        isLoading = false,
                        plans = plans,
                        selectedPlanId = selectedPlan?.planId.orEmpty(),
                        trialDays = resolveTrialDays(selectedPlan, flags.premiumTrialDays),
                        isAlreadyPremium = preferences.isPremium,
                        premiumExpiresAt = formatPremiumExpiration(preferences.premiumExpiresAt, preferences.language),
                        yearlySavingsPercent = calculateSavings(plans),
                    )
                }
            }
            viewModelScope.launch {
                billingManager.purchaseState.collectLatest { purchaseState ->
                    when (purchaseState) {
                        is AppResult.Success -> {
                            val language = preferencesRepository.current().language
                            setState {
                                copy(
                                    purchaseSuccess = true,
                                    error = null,
                                    isAlreadyPremium = purchaseState.data.isPremium,
                                    premiumExpiresAt =
                                        formatPremiumExpiration(
                                            purchaseState.data.premiumExpiresAt,
                                            language ?: "tr",
                                        ),
                                )
                            }
                        }
                        is AppResult.Error -> setState { copy(purchaseSuccess = false, error = purchaseState.exception.message) }
                        AppResult.Loading -> setState { copy(purchaseSuccess = false, error = null) }
                        null -> Unit
                    }
                }
            }
        }

        override fun onEvent(event: PremiumUiEvent) {
            when (event) {
                is PremiumUiEvent.SelectPlan ->
                    setState {
                        val selectedPlan = plans.firstOrNull { it.planId == event.planId }
                        copy(
                            selectedPlanId = event.planId,
                            trialDays = resolveTrialDays(selectedPlan, merchandisingTrialDays),
                        )
                    }
                is PremiumUiEvent.Purchase -> {
                    billingManager.clearPurchaseState()
                    setState { copy(purchaseSuccess = false, error = null) }
                    billingManager.launchPurchase(event.activity, state.value.selectedPlanId)
                }
                PremiumUiEvent.Restore ->
                    viewModelScope.launch {
                        billingManager.clearPurchaseState()
                        setState { copy(purchaseSuccess = false, error = null) }
                        billingManager.restorePurchases()
                    }
                PremiumUiEvent.DismissSuccess -> {
                    billingManager.clearPurchaseState()
                    setState { copy(purchaseSuccess = false) }
                }
            }
        }

        private fun calculateSavings(plans: List<PremiumPlanUi>): Int {
            val monthly = plans.firstOrNull { it.productId == "premium_monthly" }?.priceAmountMicros ?: 0L
            val yearly = plans.firstOrNull { it.productId == "premium_yearly" }?.priceAmountMicros ?: 0L
            return com.parsfilo.astrology.core.data.repository
                .calculateYearlySavingsPercent(monthly, yearly)
        }

        private fun resolveTrialDays(
            selectedPlan: PremiumPlanUi?,
            merchandisingTrialDays: Int,
        ): Int {
            if (selectedPlan?.hasFreeTrial == true) {
                return selectedPlan.trialDays ?: merchandisingTrialDays
            }
            if (merchandisingTrialDays > 0) {
                Timber.w("Remote Config trial copy is enabled but the selected Play offer has no free trial.")
            }
            return 0
        }

        private fun formatPremiumExpiration(
            premiumExpiresAt: Long?,
            language: String,
        ): String? {
            val millis = premiumExpiresAt ?: return null
            val locale = if (language.startsWith("tr")) Locale.forLanguageTag("tr-TR") else Locale.ENGLISH
            return DateTimeFormatter
                .ofPattern("d MMM yyyy", locale)
                .format(Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).toLocalDate())
        }
    }
