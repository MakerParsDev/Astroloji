@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.premium

import android.app.Activity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.data.repository.PremiumPlanUi
import com.parsfilo.astrology.core.ui.components.AstrologyCard
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

    val selected =
        uiState.plans.firstOrNull { it.planId == uiState.selectedPlanId }
            ?: uiState.plans.firstOrNull()
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
                selected = selected,
                purchaseReady = activity != null && isPremiumOfferReady(selected),
            ),
        callbacks =
            PremiumContentCallbacks(
                offer = callbacks,
                onRetryCatalogue = { viewModel.onEvent(PremiumUiEvent.RetryCatalogue) },
                onManageSubscription = { openSubscriptionManagement(context) },
                onDismissSuccess = { viewModel.onEvent(PremiumUiEvent.DismissSuccess) },
            ),
        modifier = modifier,
    )
}

@Composable
private fun PremiumContent(
    model: PremiumContentModel,
    callbacks: PremiumContentCallbacks,
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
            when {
                model.uiState.isAlreadyPremium -> {
                    PremiumActiveCard(model.uiState, callbacks.onManageSubscription)
                }

                model.selected != null -> {
                    PremiumOfferCard(
                        uiState = model.uiState,
                        plans = model.uiState.plans,
                        selected = model.selected,
                        purchaseReady = model.purchaseReady,
                        callbacks = callbacks.offer,
                    )
                }
            }
            when (premiumErrorMode(model.uiState, model.selected)) {
                PremiumErrorMode.RETRY_CATALOGUE ->
                    ErrorState(
                        message =
                            model.uiState.error
                                ?: stringResource(R.string.billing_catalogue_unavailable),
                        onRetry = callbacks.onRetryCatalogue,
                    )

                PremiumErrorMode.MESSAGE -> PremiumInlineError(model.uiState.error.orEmpty())
                PremiumErrorMode.NONE -> Unit
            }
            PremiumBenefitsCard()
            if (model.uiState.purchaseSuccess) {
                PremiumSuccessCard(callbacks.onDismissSuccess)
            }
        }
    }
}

@Composable
private fun PremiumInlineError(message: String) {
    AstrologyCard {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
        )
    }
}

internal enum class PremiumErrorMode {
    NONE,
    RETRY_CATALOGUE,
    MESSAGE,
}

internal fun premiumErrorMode(
    uiState: PremiumUiState,
    selected: PremiumPlanUi?,
): PremiumErrorMode =
    when {
        uiState.isAlreadyPremium -> PremiumErrorMode.NONE
        selected == null -> PremiumErrorMode.RETRY_CATALOGUE
        uiState.error != null -> PremiumErrorMode.MESSAGE
        else -> PremiumErrorMode.NONE
    }

private data class PremiumContentModel(
    val uiState: PremiumUiState,
    val selected: PremiumPlanUi?,
    val purchaseReady: Boolean,
)

private data class PremiumContentCallbacks(
    val offer: PremiumOfferCallbacks,
    val onRetryCatalogue: () -> Unit,
    val onManageSubscription: () -> Unit,
    val onDismissSuccess: () -> Unit,
)

internal data class PremiumOfferCallbacks(
    val onSelectPlan: (String) -> Unit,
    val onPurchase: () -> Unit,
    val onContinueFree: () -> Unit,
    val onRestore: () -> Unit,
)
