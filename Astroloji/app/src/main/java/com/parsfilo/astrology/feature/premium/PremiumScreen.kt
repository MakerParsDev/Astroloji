@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.premium

import android.app.Activity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.parsfilo.astrology.core.data.repository.PremiumPlanUi
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.ui.components.ErrorState
import com.parsfilo.astrology.core.ui.components.LoadingState
import com.parsfilo.astrology.core.util.openSubscriptionManagement

@Composable
fun PremiumScreen(
    modifier: Modifier = Modifier,
    source: String = "nav",
    onContinueFree: () -> Unit = {},
    viewModel: PremiumViewModel = hiltViewModel(),
) {
    val uiState by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val activity = context as? Activity

    LaunchedEffect(source) {
        viewModel.onEvent(PremiumUiEvent.ScreenViewed(source = source))
    }

    if (uiState.isLoading) {
        LoadingState()
        return
    }

    val displayPlans = uiState.plans.ifEmpty { placeholderPremiumPlans() }
    val selected = displayPlans.firstOrNull { it.planId == uiState.selectedPlanId } ?: displayPlans.first()
    val purchasablePlan = uiState.plans.firstOrNull { it.planId == uiState.selectedPlanId }
    val callbacks =
        PremiumOfferCallbacks(
            onSelectPlan = { viewModel.onEvent(PremiumUiEvent.SelectPlan(it)) },
            onPurchase = { activity?.let { viewModel.onEvent(PremiumUiEvent.Purchase(it)) } },
            onContinueFree = onContinueFree,
            onRestore = { viewModel.onEvent(PremiumUiEvent.Restore) },
        )

    PremiumContent(
        model =
            PremiumContentModel(
                uiState = uiState,
                displayPlans = displayPlans,
                selected = selected,
                purchaseReady = activity != null && isPremiumOfferReady(purchasablePlan),
            ),
        callbacks = callbacks,
        onManageSubscription = { openSubscriptionManagement(context) },
        onDismissSuccess = { viewModel.onEvent(PremiumUiEvent.DismissSuccess) },
        modifier = modifier,
    )
}

@Composable
private fun PremiumContent(
    model: PremiumContentModel,
    callbacks: PremiumOfferCallbacks,
    onManageSubscription: () -> Unit,
    onDismissSuccess: () -> Unit,
    modifier: Modifier = Modifier,
) {
    CosmicBackground(modifier = modifier.fillMaxSize()) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            PremiumHero()
            if (model.uiState.isAlreadyPremium) {
                PremiumActiveCard(model.uiState, onManageSubscription)
            } else {
                PremiumOfferCard(
                    uiState = model.uiState,
                    plans = model.displayPlans,
                    selected = model.selected,
                    purchaseReady = model.purchaseReady,
                    callbacks = callbacks,
                )
            }
            PremiumBenefitsCard()
            if (model.uiState.purchaseSuccess) {
                PremiumSuccessCard(onDismissSuccess)
            }
            model.uiState.error?.let { ErrorState(message = it, onRetry = {}) }
        }
    }
}

private data class PremiumContentModel(
    val uiState: PremiumUiState,
    val displayPlans: List<PremiumPlanUi>,
    val selected: PremiumPlanUi,
    val purchaseReady: Boolean,
)

internal data class PremiumOfferCallbacks(
    val onSelectPlan: (String) -> Unit,
    val onPurchase: () -> Unit,
    val onContinueFree: () -> Unit,
    val onRestore: () -> Unit,
)
