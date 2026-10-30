@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.ui.components.AstrologyCard
import com.parsfilo.astrology.core.ui.components.ZodiacIcon
import com.parsfilo.astrology.core.util.ZodiacSign

@Suppress("LongParameterList")
@Composable
internal fun OnboardingSignSelection(
    hasBirthDate: Boolean,
    selected: ZodiacSign?,
    manualSelectionEnabled: Boolean,
    language: String,
    onManualSelectionChange: (Boolean) -> Unit,
    onSelectSign: (ZodiacSign) -> Unit,
) {
    if (selected == null) {
        TextButton(onClick = { onManualSelectionChange(!manualSelectionEnabled) }) {
            Text(
                stringResource(
                    if (manualSelectionEnabled) {
                        R.string.onboarding_hide_sign_choices
                    } else {
                        R.string.onboarding_choose_sign_without_birthdate
                    },
                ),
            )
        }
    } else {
        DetectedSignCard(
            sign = selected,
            language = language,
            hasBirthDate = hasBirthDate,
            manualSelectionEnabled = manualSelectionEnabled,
            onManualSelectionChange = onManualSelectionChange,
        )
    }
    if (manualSelectionEnabled) {
        ManualSignGrid(selected = selected, language = language, onSelectSign = onSelectSign)
    }
}

@Composable
private fun DetectedSignCard(
    sign: ZodiacSign,
    language: String,
    hasBirthDate: Boolean,
    manualSelectionEnabled: Boolean,
    onManualSelectionChange: (Boolean) -> Unit,
) {
    AstrologyCard {
        Text(
            text =
                stringResource(
                    if (hasBirthDate) {
                        R.string.onboarding_detected_sign_label
                    } else {
                        R.string.onboarding_manual_selection_title
                    },
                ),
            style = MaterialTheme.typography.titleMedium,
        )
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            ZodiacIcon(
                sign = sign,
                modifier = Modifier.size(24.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
            Text(sign.localizedName(language), style = MaterialTheme.typography.bodyLarge)
        }
        Text(
            text = sign.localizedDateRange(language),
            style = MaterialTheme.typography.bodyMedium,
        )
        TextButton(onClick = { onManualSelectionChange(!manualSelectionEnabled) }) {
            Text(
                if (manualSelectionEnabled) {
                    stringResource(
                        if (hasBirthDate) {
                            R.string.onboarding_hide_manual_selection
                        } else {
                            R.string.onboarding_hide_sign_choices
                        },
                    )
                } else {
                    stringResource(R.string.onboarding_show_manual_selection)
                },
            )
        }
    }
}
