package com.parsfilo.astrology.feature.premium

import android.app.Activity
import androidx.lifecycle.viewModelScope
import com.parsfilo.astrology.BuildConfig
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.BillingCatalogueLoadResult
import com.parsfilo.astrology.core.data.repository.BillingManager
import com.parsfilo.astrology.core.data.repository.PremiumPlanUi
import com.parsfilo.astrology.core.data.repository.RemoteConfigRepository
import com.parsfilo.astrology.core.data.repository.defaultPremiumPlan
import com.parsfilo.astrology.core.ui.MviViewModel
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.BillingFailureReason
import com.parsfilo.astrology.core.util.TimeUtils
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
    val error: String? = null,
    val purchaseSuccess: Boolean = false,
    val paywallSource: String = "nav",
)

sealed interface PremiumUiEvent {
    data class ScreenViewed(
        val source: String,
    ) : PremiumUiEvent

    data class SelectPlan(
        val planId: String,
    ) : PremiumUiEvent

    data class Purchase(
        val activity: Activity,
    ) : PremiumUiEvent

    data object Restore : PremiumUiEvent

    data object RetryCatalogue : PremiumUiEvent

    data object DismissSuccess : PremiumUiEvent
}

private enum class BillingAction {
    NONE,
    PURCHASE,
    RESTORE,
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
        private var billingAction: BillingAction = BillingAction.NONE
        private var catalogueLoadGeneration: Long = 0
        private var purchasedPlan: PremiumPlanUi? = null

        init {
            viewModelScope.launch {
                billingManager.clearPurchaseState()
                val preferences = preferencesRepository.current()
                val flags = remoteConfigRepository.fetchFlags()
                merchandisingTrialDays = flags.premiumTrialDays
                setState {
                    copy(
                        isAlreadyPremium = preferences.isPremium,
                        premiumExpiresAt = formatPremiumExpiration(preferences.premiumExpiresAt, preferences.language),
                    )
                }
                loadCatalogue()
            }
            viewModelScope.launch {
                billingManager.purchaseState.collectLatest { purchaseState ->
                    when (purchaseState) {
                        is AppResult.Success -> {
                            val language = preferencesRepository.current().language
                            val completedAction = billingAction
                            val completedPlan = purchasedPlan
                            billingAction = BillingAction.NONE
                            purchasedPlan = null
                            setState {
                                copy(
                                    purchaseSuccess = true,
                                    error = null,
                                    isAlreadyPremium = purchaseState.data.isPremium,
                                    premiumExpiresAt =
                                        formatPremiumExpiration(
                                            purchaseState.data.premiumExpiresAt,
                                            language,
                                        ),
                                )
                            }
                            when (completedAction) {
                                BillingAction.PURCHASE ->
                                    viewModelScope.launch {
                                        analyticsRepository.track(
                                            AnalyticsEvents.PURCHASE_SUCCEEDED,
                                            mapOf(
                                                "source" to state.value.paywallSource,
                                                "product" to purchaseState.data.productId,
                                            ),
                                        )
                                        if (completedPlan?.hasFreeTrial == true) {
                                            analyticsRepository.track(
                                                AnalyticsEvents.TRIAL_STARTED,
                                                mapOf(
                                                    "source" to state.value.paywallSource,
                                                    "plan" to completedPlan.planId,
                                                    "product" to completedPlan.productId,
                                                ),
                                            )
                                        }
                                    }
                                BillingAction.RESTORE ->
                                    viewModelScope.launch {
                                        analyticsRepository.track(
                                            AnalyticsEvents.PREMIUM_RESTORED,
                                            mapOf("product" to purchaseState.data.productId),
                                        )
                                    }
                                BillingAction.NONE -> Unit
                            }
                        }
                        is AppResult.Error -> {
                            val failedAction = billingAction
                            val billingException = purchaseState.exception as? AppException.BillingException
                            val failureReason = billingException?.reason ?: BillingFailureReason.UNKNOWN
                            val isCancelled = failureReason == BillingFailureReason.USER_CANCELLED
                            billingAction = BillingAction.NONE
                            setState {
                                copy(
                                    purchaseSuccess = false,
                                    error = purchaseState.exception.message.takeUnless { isCancelled },
                                )
                            }
                            if (failedAction == BillingAction.PURCHASE) {
                                viewModelScope.launch {
                                    analyticsRepository.track(
                                        if (isCancelled) {
                                            AnalyticsEvents.PURCHASE_CANCELLED
                                        } else {
                                            AnalyticsEvents.PURCHASE_FAILED
                                        },
                                        mapOf(
                                            "source" to state.value.paywallSource,
                                            "reason" to failureReason.analyticsValue,
                                        ),
                                    )
                                }
                            }
                        }
                        AppResult.Loading -> setState { copy(purchaseSuccess = false, error = null) }
                        null -> Unit
                    }
                }
            }
        }

        override fun onEvent(event: PremiumUiEvent) {
            when (event) {
                is PremiumUiEvent.ScreenViewed -> handleScreenViewed(event)
                is PremiumUiEvent.SelectPlan -> handlePlanSelected(event)
                is PremiumUiEvent.Purchase -> handlePurchase(event)
                PremiumUiEvent.Restore -> handleRestore()
                PremiumUiEvent.RetryCatalogue -> loadCatalogue()
                PremiumUiEvent.DismissSuccess -> {
                    billingManager.clearPurchaseState()
                    setState { copy(purchaseSuccess = false) }
                }
            }
        }

        private fun loadCatalogue() {
            val generation = ++catalogueLoadGeneration
            viewModelScope.launch {
                setState { copy(isLoading = true, error = null) }
                val language = preferencesRepository.current().language
                val result =
                    resolvePremiumCatalogue(
                        storeScreenshotQa = BuildConfig.STORE_SCREENSHOT_QA,
                        language = language,
                    ) {
                        billingManager.loadPlans()
                    }
                if (generation != catalogueLoadGeneration) return@launch

                when (result) {
                    is BillingCatalogueLoadResult.Success -> {
                        val selectedPlan = defaultPremiumPlan(result.plans)
                        setState {
                            copy(
                                isLoading = false,
                                plans = result.plans,
                                selectedPlanId = selectedPlan?.planId.orEmpty(),
                                trialDays = resolveTrialDays(selectedPlan, merchandisingTrialDays),
                                error = null,
                            )
                        }
                    }

                    is BillingCatalogueLoadResult.Failure ->
                        setState {
                            copy(
                                isLoading = false,
                                plans = emptyList(),
                                selectedPlanId = "",
                                trialDays = 0,
                                error = result.message,
                            )
                        }
                }
            }
        }

        private fun handleScreenViewed(event: PremiumUiEvent.ScreenViewed) {
            setState { copy(paywallSource = event.source) }
            viewModelScope.launch {
                analyticsRepository.track(
                    AnalyticsEvents.PAYWALL_VIEWED,
                    mapOf("source" to event.source),
                )
            }
        }

        private fun handlePlanSelected(event: PremiumUiEvent.SelectPlan) {
            val selectedPlan = state.value.plans.firstOrNull { it.planId == event.planId }
            setState {
                copy(
                    selectedPlanId = event.planId,
                    trialDays = resolveTrialDays(selectedPlan, merchandisingTrialDays),
                )
            }
            selectedPlan ?: return
            viewModelScope.launch {
                analyticsRepository.track(
                    AnalyticsEvents.PAYWALL_PLAN_SELECTED,
                    planAnalyticsMeta(selectedPlan),
                )
            }
        }

        private fun handlePurchase(event: PremiumUiEvent.Purchase) {
            val selectedPlan = state.value.plans.firstOrNull { it.planId == state.value.selectedPlanId }
            billingManager.clearPurchaseState()
            billingAction = BillingAction.PURCHASE
            purchasedPlan = selectedPlan
            setState { copy(purchaseSuccess = false, error = null) }
            if (selectedPlan != null) {
                viewModelScope.launch {
                    analyticsRepository.track(
                        AnalyticsEvents.PURCHASE_STARTED,
                        planAnalyticsMeta(selectedPlan),
                    )
                }
            }
            billingManager.launchPurchase(event.activity, state.value.selectedPlanId)
        }

        private fun handleRestore() {
            viewModelScope.launch {
                billingManager.clearPurchaseState()
                billingAction = BillingAction.RESTORE
                setState { copy(purchaseSuccess = false, error = null) }
                billingManager.restorePurchases()
            }
        }

        private fun planAnalyticsMeta(plan: PremiumPlanUi): Map<String, String> =
            mapOf(
                "source" to state.value.paywallSource,
                "plan" to plan.planId,
                "product" to plan.productId,
            )

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
            val locale =
                when (TimeUtils.normalizeLanguageTag(language)) {
                    "tr" -> Locale.forLanguageTag("tr-TR")
                    "es" -> Locale.forLanguageTag("es-ES")
                    "pt" -> Locale.forLanguageTag("pt-BR")
                    else -> Locale.ENGLISH
                }
            return DateTimeFormatter
                .ofPattern("d MMM yyyy", locale)
                .format(Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).toLocalDate())
        }
    }
