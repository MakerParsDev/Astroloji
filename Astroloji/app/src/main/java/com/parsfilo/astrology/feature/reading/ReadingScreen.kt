@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.reading

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.ui.components.AstrologyCard
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.ui.components.ErrorState
import com.parsfilo.astrology.core.ui.components.LoadingState
import com.parsfilo.astrology.core.ui.components.PremiumGoldButton

@Composable
fun ReadingScreen(
    onOpenCredits: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ReadingViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

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
            Text(text = stringResource(R.string.reading_title), style = MaterialTheme.typography.displaySmall)
            when {
                uiState.insufficientCredits ->
                    AstrologyCard {
                        Text(
                            text = stringResource(R.string.reading_insufficient_credits),
                            style = MaterialTheme.typography.bodyLarge,
                        )
                        PremiumGoldButton(
                            text = stringResource(R.string.reading_get_credits_cta),
                            onClick = onOpenCredits,
                        )
                    }
                uiState.error != null ->
                    ErrorState(
                        message = uiState.error.orEmpty(),
                        onRetry = { viewModel.onEvent(ReadingUiEvent.Retry) },
                    )
                uiState.text != null ->
                    AstrologyCard {
                        Text(text = uiState.text.orEmpty(), style = MaterialTheme.typography.bodyLarge)
                    }
            }
        }
    }
}
