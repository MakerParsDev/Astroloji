@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.premium

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.ui.components.AstrologyCard
import com.parsfilo.astrology.core.ui.components.PremiumSectionHeader

@Composable
internal fun PremiumActiveCard(
    uiState: PremiumUiState,
    onManageSubscription: () -> Unit,
) {
    AstrologyCard {
        Text(
            text = stringResource(R.string.premium_already_active),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text =
                uiState.premiumExpiresAt?.let {
                    stringResource(R.string.premium_expires_on, it)
                } ?: stringResource(R.string.premium_success_body),
            style = MaterialTheme.typography.bodyLarge,
        )
        OutlinedButton(
            onClick = onManageSubscription,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.premium_manage_in_play_store))
        }
    }
}

@Composable
internal fun PremiumBenefitsCard() {
    AstrologyCard {
        PremiumSectionHeader(
            title = stringResource(R.string.premium_benefits_title),
        )
        premiumFeatureStrings().forEach { feature ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Text(
                    text = "✓",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
                Text(
                    text = feature,
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
        }
    }
}

@Composable
internal fun PremiumSuccessCard(onDismiss: () -> Unit) {
    AstrologyCard {
        Text(
            text = stringResource(R.string.premium_success_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        Text(stringResource(R.string.premium_success_body))
        Button(
            onClick = onDismiss,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.common_ok))
        }
    }
}

@Composable
private fun premiumFeatureStrings(): List<String> =
    listOf(
        stringResource(R.string.premium_feature_daily),
        stringResource(R.string.premium_feature_life_areas),
        stringResource(R.string.premium_feature_forecasts),
        stringResource(R.string.premium_feature_personality),
        stringResource(R.string.premium_feature_compatibility),
        stringResource(R.string.premium_feature_ad_free),
        stringResource(R.string.premium_feature_share_cards),
    )
