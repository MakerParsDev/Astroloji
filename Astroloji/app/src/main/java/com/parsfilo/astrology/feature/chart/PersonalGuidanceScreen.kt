@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.chart

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.domain.model.GuidanceSignal
import com.parsfilo.astrology.core.domain.model.PersonalGuidance
import com.parsfilo.astrology.core.ui.components.AstrologyCard
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.ui.components.ErrorState
import com.parsfilo.astrology.core.ui.components.PremiumSectionHeader
import com.parsfilo.astrology.core.util.TimeUtils
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

private data class GuidanceInputCallbacks(
    val onChooseDate: () -> Unit,
    val onCalculate: () -> Unit,
    val onClear: () -> Unit,
)

@Composable
fun PersonalGuidanceScreen(
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: PersonalGuidanceViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val configuration = LocalConfiguration.current
    val language = configuration.locales[0].language
    val locale =
        when (TimeUtils.normalizeLanguageTag(language)) {
            "tr" -> Locale.forLanguageTag("tr-TR")
            "es" -> Locale.forLanguageTag("es-ES")
            "pt" -> Locale.forLanguageTag("pt-BR")
            else -> Locale.ENGLISH
        }
    val dateFormatter = remember(locale) { DateTimeFormatter.ofPattern("d MMMM yyyy", locale) }
    val selectedDateLabel =
        uiState.birthDateMillis?.let {
            Instant
                .ofEpochMilli(it)
                .atZone(ZoneOffset.UTC)
                .toLocalDate()
                .format(dateFormatter)
        }
    var showDatePicker by remember { mutableStateOf(false) }

    if (showDatePicker) {
        BirthDatePicker(
            initialSelection = uiState.birthDateMillis,
            onDismiss = { showDatePicker = false },
            onSelected = {
                viewModel.selectBirthDate(it)
                showDatePicker = false
            },
        )
    }

    PersonalGuidanceContent(
        uiState = uiState,
        selectedDateLabel = selectedDateLabel,
        callbacks =
            PersonalGuidanceCallbacks(
                onNavigateBack = onNavigateBack,
                onChooseDate = { showDatePicker = true },
                onCalculate = viewModel::loadGuidance,
                onClear = viewModel::clearBirthData,
            ),
        modifier = modifier,
    )
}

private data class PersonalGuidanceCallbacks(
    val onNavigateBack: () -> Unit,
    val onChooseDate: () -> Unit,
    val onCalculate: () -> Unit,
    val onClear: () -> Unit,
)

@Composable
private fun PersonalGuidanceContent(
    uiState: PersonalGuidanceUiState,
    selectedDateLabel: String?,
    callbacks: PersonalGuidanceCallbacks,
    modifier: Modifier = Modifier,
) {
    CosmicBackground(modifier = modifier.fillMaxSize()) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            TextButton(onClick = callbacks.onNavigateBack) {
                Text(stringResource(R.string.chart_back))
            }
            PremiumSectionHeader(
                title = stringResource(R.string.chart_title),
                eyebrow = stringResource(R.string.chart_beta_label),
                supportingText = stringResource(R.string.chart_intro),
            )
            GuidancePrivacyCards()
            GuidanceInputCard(
                selectedDateLabel = selectedDateLabel,
                isLoading = uiState.isLoading,
                inputError = uiState.inputError,
                callbacks =
                    GuidanceInputCallbacks(
                        onChooseDate = callbacks.onChooseDate,
                        onCalculate = callbacks.onCalculate,
                        onClear = callbacks.onClear,
                    ),
            )
            uiState.error?.let {
                ErrorState(message = it, onRetry = callbacks.onCalculate)
            }
            uiState.guidance?.let { GuidanceResults(it) }
        }
    }
}

@Composable
private fun BirthDatePicker(
    initialSelection: Long?,
    onDismiss: () -> Unit,
    onSelected: (Long) -> Unit,
) {
    val state = rememberDatePickerState(initialSelectedDateMillis = initialSelection)
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                onClick = { state.selectedDateMillis?.let(onSelected) },
                enabled = state.selectedDateMillis != null,
            ) {
                Text(stringResource(R.string.onboarding_confirm_date))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.onboarding_cancel))
            }
        },
    ) {
        DatePicker(state = state)
    }
}

@Composable
private fun GuidancePrivacyCards() {
    AstrologyCard {
        Text(
            text = stringResource(R.string.chart_privacy_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = stringResource(R.string.chart_privacy_body),
            style = MaterialTheme.typography.bodyMedium,
        )
    }
    AstrologyCard {
        Text(
            text = stringResource(R.string.chart_limit_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = stringResource(R.string.chart_limit_body),
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}

@Composable
private fun GuidanceInputCard(
    selectedDateLabel: String?,
    isLoading: Boolean,
    inputError: ChartInputError?,
    callbacks: GuidanceInputCallbacks,
) {
    AstrologyCard {
        Text(
            text = stringResource(R.string.chart_birthdate_label),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = selectedDateLabel ?: stringResource(R.string.chart_birthdate_placeholder),
            style = MaterialTheme.typography.bodyLarge,
        )
        if (inputError == ChartInputError.FUTURE_BIRTH_DATE) {
            Text(
                text = stringResource(R.string.chart_future_date_error),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        OutlinedButton(
            onClick = callbacks.onChooseDate,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.chart_birthdate_action))
        }
        Button(
            onClick = callbacks.onCalculate,
            enabled = selectedDateLabel != null && !isLoading,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                if (isLoading) {
                    stringResource(R.string.chart_calculating)
                } else {
                    stringResource(R.string.chart_calculate)
                },
            )
        }
        if (selectedDateLabel != null) {
            TextButton(
                onClick = callbacks.onClear,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(R.string.chart_clear))
            }
        }
    }
}

@Composable
private fun GuidanceResults(guidance: PersonalGuidance) {
    Text(
        text = stringResource(R.string.chart_results_title),
        style = MaterialTheme.typography.headlineMedium,
        fontWeight = FontWeight.Bold,
    )
    guidance.signals.forEach { GuidanceSignalCard(it) }
    AstrologyCard {
        Text(
            text = stringResource(R.string.chart_disclaimer_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = guidance.disclaimer,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun GuidanceSignalCard(signal: GuidanceSignal) {
    AstrologyCard {
        Text(
            text = signal.title,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = signal.summary,
            style = MaterialTheme.typography.bodyLarge,
        )
        Text(
            text = stringResource(R.string.chart_action_title),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = signal.actionPrompt,
            style = MaterialTheme.typography.bodyMedium,
        )
        Text(
            text = stringResource(R.string.chart_evidence_orb, signal.evidence.orb),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
