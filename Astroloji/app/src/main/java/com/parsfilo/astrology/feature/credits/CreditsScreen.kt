@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.credits

import android.app.Activity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.data.repository.CreditPackUi
import com.parsfilo.astrology.core.ui.components.AstrologyCard
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.ui.components.ErrorState
import com.parsfilo.astrology.core.ui.components.LoadingState
import com.parsfilo.astrology.core.ui.components.PremiumGoldButton

@Composable
fun CreditsScreen(
    modifier: Modifier = Modifier,
    viewModel: CreditsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val activity = context as? Activity

    if (uiState.isLoading) {
        LoadingState()
        return
    }

    CosmicBackground(modifier = modifier.fillMaxSize()) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(text = stringResource(R.string.credits_title), style = MaterialTheme.typography.displaySmall)
            uiState.balance?.let { balance ->
                Text(
                    text = stringResource(R.string.credits_balance_label, balance),
                    style = MaterialTheme.typography.titleMedium,
                )
            }
            Text(
                text = stringResource(R.string.credits_body),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            CreditsCatalogueSection(uiState = uiState, activity = activity, onEvent = viewModel::onEvent)
        }
    }
}

@Composable
private fun CreditsCatalogueSection(
    uiState: CreditsUiState,
    activity: Activity?,
    onEvent: (CreditsUiEvent) -> Unit,
) {
    if (uiState.packs.isEmpty()) {
        ErrorState(
            message = uiState.error ?: stringResource(R.string.credits_catalogue_unavailable),
            onRetry = { onEvent(CreditsUiEvent.RetryCatalogue) },
        )
    } else {
        uiState.packs.forEach { pack ->
            CreditPackCard(
                pack = pack,
                enabled = activity != null && !uiState.isPurchasing,
                onPurchase = {
                    activity?.let { onEvent(CreditsUiEvent.Purchase(it, pack.productId)) }
                },
            )
        }
    }
    uiState.purchaseSuccessCredits?.let { credits ->
        AstrologyCard {
            Text(
                text = stringResource(R.string.credits_purchase_success, credits),
                style = MaterialTheme.typography.titleMedium,
            )
        }
    }
    if (uiState.error != null && uiState.packs.isNotEmpty()) {
        Text(
            text = uiState.error.orEmpty(),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
        )
    }
}

@Composable
private fun CreditPackCard(
    pack: CreditPackUi,
    enabled: Boolean,
    onPurchase: () -> Unit,
) {
    AstrologyCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(text = pack.title, style = MaterialTheme.typography.titleMedium)
                Text(
                    text = stringResource(R.string.credits_pack_amount, pack.credits),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            PremiumGoldButton(text = pack.price, onClick = onPurchase, enabled = enabled)
        }
    }
}
