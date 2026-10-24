package com.parsfilo.astrology.feature.personality

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.domain.model.PersonalityReport
import com.parsfilo.astrology.core.ui.components.AstrologyCard
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.ui.components.ErrorState
import com.parsfilo.astrology.core.ui.components.LoadingState
import com.parsfilo.astrology.core.ui.components.PremiumHeroCard
import com.parsfilo.astrology.core.util.ZodiacSign

// The route's sign is loaded by the ViewModel from SavedStateHandle.
// Keep the public composable parameter for navigation callers.
@Suppress("UnusedParameter", "FunctionNaming", "LongMethod")
@Composable
fun PersonalityScreen(
    sign: String,
    onOpenPremium: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: PersonalityViewModel = hiltViewModel(),
) {
    val uiState by viewModel.state.collectAsStateWithLifecycle()
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
                    .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            uiState.report?.let { report ->
                PersonalityHero(report)
                Button(
                    onClick = { viewModel.onEvent(PersonalityUiEvent.ToggleFavorite) },
                    colors =
                        ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant,
                            contentColor = MaterialTheme.colorScheme.onSurface,
                        ),
                ) {
                    Text(
                        if (uiState.isFavorite) {
                            stringResource(R.string.favorites_remove)
                        } else {
                            stringResource(R.string.favorites_add)
                        },
                    )
                }
                AstrologyCard {
                    Text(report.summary, style = MaterialTheme.typography.bodyLarge)
                    Text("${report.element} • ${report.planet} • ${report.color}")
                }
                val highlights = visiblePersonalityHighlights(report)
                if (highlights.hasContent) {
                    AstrologyCard {
                        if (highlights.strengths.isNotEmpty()) {
                            Text(
                                stringResource(R.string.personality_strengths_title),
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                            )
                            highlights.strengths.forEach { Text("• $it") }
                        }
                        if (highlights.partners.isNotEmpty()) {
                            Text(
                                stringResource(
                                    R.string.personality_ideal_partners,
                                    highlights.partners.joinToString(),
                                ),
                            )
                        }
                    }
                }
                AstrologyCard {
                    if (report.deepAnalysis == null) {
                        Text(stringResource(R.string.personality_premium_locked))
                        Button(onClick = onOpenPremium) { Text(stringResource(R.string.common_open_premium)) }
                    } else {
                        Text(report.deepAnalysis)
                        report.weaknesses.forEach { Text("• $it") }
                        report.careerFit.forEach { Text("• $it") }
                    }
                }
            }
            uiState.error?.let { ErrorState(message = it, onRetry = {}) }
        }
    }
}

@Suppress("FunctionNaming")
@Composable
internal fun PersonalityHero(report: PersonalityReport) {
    val sign = ZodiacSign.fromKey(report.sign)
    PremiumHeroCard(
        symbol = sign.symbol,
        eyebrow = sign.localizedDateRange(report.language),
        title = sign.localizedName(report.language),
        subtitle = "${report.element} • ${report.planet} • ${report.color}",
    )
}
