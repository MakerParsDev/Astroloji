package com.parsfilo.astrology.feature.premium

import android.app.Activity
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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
import com.parsfilo.astrology.ui.theme.DarkBackground
import com.parsfilo.astrology.ui.theme.DarkPrimary
import com.parsfilo.astrology.ui.theme.DarkSecondary

@Suppress("LongMethod", "CyclomaticComplexMethod", "FunctionNaming")
@Composable
fun PremiumScreen(
    source: String = "nav",
    modifier: Modifier = Modifier,
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

    val plans =
        uiState.plans.ifEmpty {
            listOf(
                PremiumPlanUi(
                    planId = "premium_monthly:base:default",
                    productId = "premium_monthly",
                    title = stringResource(R.string.premium_monthly_label),
                    price = "...",
                    displayPriority = 1,
                ),
                PremiumPlanUi(
                    planId = "premium_yearly:base:default",
                    productId = "premium_yearly",
                    title = stringResource(R.string.premium_yearly_label),
                    price = "...",
                    displayPriority = 0,
                ),
            )
        }
    val selected = plans.firstOrNull { it.planId == uiState.selectedPlanId } ?: plans.first()

    CosmicBackground(modifier = modifier.fillMaxSize()) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Box(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .height(290.dp)
                        .background(
                            Brush.verticalGradient(
                                listOf(
                                    DarkPrimary.copy(alpha = 0.24f),
                                    DarkBackground.copy(alpha = 0.98f),
                                    DarkSecondary.copy(alpha = 0.18f),
                                ),
                            ),
                            shape = RoundedCornerShape(30.dp),
                        ).padding(24.dp),
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
                            modifier = Modifier.padding(18.dp),
                            style = MaterialTheme.typography.headlineLarge,
                            color = MaterialTheme.colorScheme.secondary,
                        )
                    }
                    Spacer(modifier = Modifier.height(18.dp))
                    Text(
                        text = stringResource(R.string.premium_title),
                        style = MaterialTheme.typography.displayLarge,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = stringResource(R.string.premium_subtitle),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                }
            }

            AstrologyCard {
                premiumFeatureStrings().forEach { feature ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        Text(
                            text = "✓",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.secondary,
                        )
                        Text(
                            text = feature,
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                }
            }

            AstrologyCard {
                if (uiState.isAlreadyPremium) {
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
                        onClick = { openSubscriptionManagement(context) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(stringResource(R.string.premium_manage_in_play_store))
                    }
                } else {
                    Text(
                        text = stringResource(R.string.premium_plan_title),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        plans.forEach { plan ->
                            val isSelected = plan.planId == uiState.selectedPlanId
                            Surface(
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(22.dp),
                                color =
                                    if (isSelected) {
                                        MaterialTheme.colorScheme.primary.copy(alpha = 0.20f)
                                    } else {
                                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
                                    },
                                border =
                                    BorderStroke(
                                        1.dp,
                                        if (isSelected) {
                                            MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)
                                        } else {
                                            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.24f)
                                        },
                                    ),
                                onClick = { viewModel.onEvent(PremiumUiEvent.SelectPlan(plan.planId)) },
                            ) {
                                Column(
                                    modifier =
                                        Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 14.dp, vertical = 16.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    Text(
                                        text =
                                            if (plan.productId.contains("year")) {
                                                stringResource(R.string.premium_yearly_label)
                                            } else {
                                                stringResource(R.string.premium_monthly_label)
                                            },
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    if (plan.productId.contains("year")) {
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
                                }
                            }
                        }
                    }

                    Text(
                        text = selected.price.takeIf { it.isNotBlank() } ?: stringResource(R.string.premium_price_loading),
                        style = MaterialTheme.typography.headlineLarge,
                        fontWeight = FontWeight.Bold,
                    )

                    if (selected.productId.contains("year") && uiState.yearlySavingsPercent > 0) {
                        Text(
                            text =
                                stringResource(
                                    R.string.premium_yearly_savings_percent,
                                    uiState.yearlySavingsPercent,
                                ),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.secondary,
                        )
                    }

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
                            label = {
                                Text(stringResource(R.string.premium_trial_days, uiState.trialDays))
                            },
                        )
                    }

                    Button(
                        onClick = { activity?.let { viewModel.onEvent(PremiumUiEvent.Purchase(it)) } },
                        modifier = Modifier.fillMaxWidth(),
                        colors =
                            ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.primary,
                                contentColor = MaterialTheme.colorScheme.onPrimary,
                            ),
                    ) {
                        Text(stringResource(R.string.premium_start_cta))
                    }

                    OutlinedButton(
                        onClick = { viewModel.onEvent(PremiumUiEvent.Restore) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(stringResource(R.string.premium_restore))
                    }
                }
            }

            if (uiState.purchaseSuccess) {
                AstrologyCard {
                    Text(
                        text = stringResource(R.string.premium_success_title),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(stringResource(R.string.premium_success_body))
                    Button(
                        onClick = { viewModel.onEvent(PremiumUiEvent.DismissSuccess) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(stringResource(R.string.common_ok))
                    }
                }
            }

            uiState.error?.let { ErrorState(message = it, onRetry = {}) }
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
