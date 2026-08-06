@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.premium

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.data.repository.PremiumPlanUi
import com.parsfilo.astrology.core.ui.components.AstrologyCard
import com.parsfilo.astrology.ui.theme.DarkBackground
import com.parsfilo.astrology.ui.theme.DarkPrimary
import com.parsfilo.astrology.ui.theme.DarkSecondary

@Composable
internal fun PremiumHero() {
    Box(
        modifier =
            Modifier
                .fillMaxWidth()
                .height(180.dp)
                .background(
                    Brush.verticalGradient(
                        listOf(
                            DarkPrimary.copy(alpha = 0.24f),
                            DarkBackground.copy(alpha = 0.98f),
                            DarkSecondary.copy(alpha = 0.18f),
                        ),
                    ),
                    shape = RoundedCornerShape(30.dp),
                ).padding(20.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.38f),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)),
            ) {
                Text(
                    text = "✦",
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.secondary,
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = stringResource(R.string.premium_title),
                style = MaterialTheme.typography.headlineLarge,
                textAlign = TextAlign.Center,
            )
            Text(
                text = stringResource(R.string.premium_subtitle),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
internal fun PremiumOfferCard(
    uiState: PremiumUiState,
    plans: List<PremiumPlanUi>,
    selected: PremiumPlanUi,
    purchaseReady: Boolean,
    callbacks: PremiumOfferCallbacks,
) {
    AstrologyCard {
        Text(
            text = stringResource(R.string.premium_plan_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        PremiumPlanSelector(
            plans = plans,
            selectedPlanId = selected.planId,
            onSelect = callbacks.onSelectPlan,
        )
        PremiumOfferSummary(uiState, selected, purchaseReady)
        Button(
            onClick = callbacks.onPurchase,
            enabled = purchaseReady,
            modifier = Modifier.fillMaxWidth(),
            colors =
                ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                ),
        ) {
            Text(premiumCtaLabel(uiState, selected, purchaseReady))
        }
        PremiumBillingDisclosure(uiState, selected, purchaseReady)
        OutlinedButton(
            onClick = callbacks.onContinueFree,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.premium_continue_free))
        }
        TextButton(
            onClick = callbacks.onRestore,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.premium_restore))
        }
    }
}

@Composable
private fun PremiumPlanSelector(
    plans: List<PremiumPlanUi>,
    selectedPlanId: String,
    onSelect: (String) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        plans.forEach { plan ->
            PremiumPlanOption(
                plan = plan,
                selected = plan.planId == selectedPlanId,
                onClick = { onSelect(plan.planId) },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun PremiumPlanOption(
    plan: PremiumPlanUi,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val containerColor =
        if (selected) {
            MaterialTheme.colorScheme.primary.copy(alpha = 0.20f)
        } else {
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
        }
    val borderColor =
        if (selected) {
            MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)
        } else {
            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.24f)
        }

    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(22.dp),
        color = containerColor,
        border = BorderStroke(1.dp, borderColor),
        onClick = onClick,
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = premiumCadenceLabel(plan),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text =
                    plan.price.takeIf { isPremiumOfferReady(plan) }
                        ?: stringResource(R.string.premium_price_loading),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
            )
            if (premiumBillingCadence(plan) == PremiumBillingCadence.YEARLY) {
                PremiumPopularChip()
            }
        }
    }
}

@Composable
private fun PremiumPopularChip() {
    AssistChip(
        onClick = {},
        enabled = false,
        border = null,
        colors =
            AssistChipDefaults.assistChipColors(
                disabledContainerColor = MaterialTheme.colorScheme.secondary.copy(alpha = 0.18f),
                disabledLabelColor = MaterialTheme.colorScheme.onSurface,
            ),
        label = {
            Text(
                text = stringResource(R.string.premium_most_popular),
                style = MaterialTheme.typography.labelSmall,
            )
        },
    )
}

@Composable
private fun PremiumOfferSummary(
    uiState: PremiumUiState,
    selected: PremiumPlanUi,
    purchaseReady: Boolean,
) {
    Text(
        text = selected.price.takeIf { purchaseReady } ?: stringResource(R.string.premium_price_loading),
        style = MaterialTheme.typography.headlineLarge,
        fontWeight = FontWeight.Bold,
    )
    if (selected.hasFreeTrial && uiState.trialDays > 0) {
        AssistChip(
            onClick = {},
            enabled = false,
            border = null,
            colors =
                AssistChipDefaults.assistChipColors(
                    disabledContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
                    disabledLabelColor = MaterialTheme.colorScheme.onSurface,
                ),
            label = { Text(stringResource(R.string.premium_trial_days, uiState.trialDays)) },
        )
    }
}

@Composable
private fun premiumCtaLabel(
    uiState: PremiumUiState,
    selected: PremiumPlanUi,
    purchaseReady: Boolean,
): String =
    when {
        !purchaseReady -> stringResource(R.string.premium_price_loading)
        selected.hasFreeTrial && uiState.trialDays > 0 ->
            stringResource(R.string.premium_start_trial_cta, uiState.trialDays)
        else -> stringResource(R.string.premium_continue_with_price, selected.price)
    }

@Composable
private fun PremiumBillingDisclosure(
    uiState: PremiumUiState,
    selected: PremiumPlanUi,
    purchaseReady: Boolean,
) {
    val text =
        if (!purchaseReady) {
            stringResource(R.string.premium_catalog_loading)
        } else {
            premiumBillingDisclosureText(uiState, selected)
        }
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun premiumBillingDisclosureText(
    uiState: PremiumUiState,
    selected: PremiumPlanUi,
): String {
    val period = premiumPeriodLabel(selected)
    return if (selected.hasFreeTrial && uiState.trialDays > 0) {
        stringResource(
            R.string.premium_billing_disclosure_trial,
            uiState.trialDays,
            selected.price,
            period,
        )
    } else {
        stringResource(R.string.premium_billing_disclosure, selected.price, period)
    }
}
