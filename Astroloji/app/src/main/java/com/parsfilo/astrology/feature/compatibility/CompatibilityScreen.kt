package com.parsfilo.astrology.feature.compatibility

import android.content.Intent
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.ads.AdaptiveBannerAd
import com.parsfilo.astrology.core.ui.components.AstrologyCard
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.ui.components.DetailChip
import com.parsfilo.astrology.core.ui.components.ErrorState
import com.parsfilo.astrology.core.ui.components.LoadingState
import com.parsfilo.astrology.core.util.TimeUtils
import com.parsfilo.astrology.core.util.ZodiacSign
import com.parsfilo.astrology.navigation.compatibilityShareLandingUrl

@Composable
fun CompatibilityScreen(
    onOpenPremium: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: CompatibilityViewModel = hiltViewModel(),
) {
    val uiState by viewModel.state.collectAsStateWithLifecycle()
    val animatedScore by animateIntAsState(targetValue = uiState.report?.overallScore ?: 0, label = "compat")
    val context = LocalContext.current
    val configuration = LocalConfiguration.current
    val appLanguage =
        com.parsfilo.astrology.core.util.TimeUtils
            .normalizeLanguageTag(configuration.locales[0].language)
    val mySign = ZodiacSign.fromKey(uiState.mySign)
    val selectedSign = ZodiacSign.fromKey(uiState.selectedSign)

    CosmicBackground(modifier = modifier.fillMaxSize()) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = stringResource(R.string.compatibility_title),
                style = MaterialTheme.typography.displayLarge,
            )

            AstrologyCard {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CompatibilitySignBubble(
                        title = stringResource(R.string.compatibility_your_sign),
                        sign = mySign,
                        language = appLanguage,
                        active = true,
                    )
                    Text(
                        text = "♥",
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.secondary,
                    )
                    CompatibilitySignBubble(
                        title = stringResource(R.string.compatibility_selected_sign),
                        sign = selectedSign,
                        language = appLanguage,
                        active = false,
                    )
                }

                Button(
                    onClick = { viewModel.onEvent(CompatibilityUiEvent.ToggleFavorite) },
                    colors =
                        ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant,
                            contentColor = MaterialTheme.colorScheme.onSurface,
                        ),
                ) {
                    Text(
                        if (uiState.selectedSign in uiState.favorites) {
                            stringResource(R.string.favorites_remove)
                        } else {
                            stringResource(R.string.favorites_add)
                        },
                    )
                }

                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    ZodiacSign.entries.filter { it.key != uiState.mySign }.forEach { sign ->
                        val isSelected = sign.key == uiState.selectedSign
                        AssistChip(
                            onClick = { viewModel.onEvent(CompatibilityUiEvent.SelectSign(sign.key)) },
                            border = null,
                            colors =
                                AssistChipDefaults.assistChipColors(
                                    containerColor =
                                        if (isSelected) {
                                            MaterialTheme.colorScheme.secondary.copy(alpha = 0.18f)
                                        } else {
                                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
                                        },
                                    labelColor = MaterialTheme.colorScheme.onSurface,
                                ),
                            label = {
                                Text(
                                    text = "${sign.symbol} ${sign.localizedName(appLanguage)}",
                                    style = MaterialTheme.typography.labelMedium,
                                )
                            },
                        )
                    }
                }
            }

            if (uiState.isLoading) {
                LoadingState(modifier = Modifier.fillMaxSize())
            }

            uiState.report?.let { report ->
                AstrologyCard {
                    Box(
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .background(
                                    Brush.radialGradient(
                                        listOf(
                                            MaterialTheme.colorScheme.secondary.copy(alpha = 0.16f),
                                            MaterialTheme.colorScheme.surface.copy(alpha = 0f),
                                        ),
                                    ),
                                    shape = RoundedCornerShape(24.dp),
                                ).padding(vertical = 12.dp),
                    ) {
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                text = TimeUtils.formatPercentage(animatedScore, appLanguage),
                                style = MaterialTheme.typography.displayLarge,
                                color = MaterialTheme.colorScheme.secondary,
                            )
                            Text(
                                text = stringResource(R.string.compatibility_label),
                                style = MaterialTheme.typography.titleMedium,
                            )
                            Text(
                                text = report.summary,
                                style = MaterialTheme.typography.bodyLarge,
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                }

                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    CompatibilityScoreCard(
                        modifier = Modifier.weight(1f),
                        title = stringResource(R.string.compatibility_love_score),
                        value = report.loveScore,
                        language = appLanguage,
                        brush =
                            Brush.horizontalGradient(
                                listOf(
                                    MaterialTheme.colorScheme.primary,
                                    MaterialTheme.colorScheme.primary.copy(alpha = 0.6f),
                                ),
                            ),
                    )
                    CompatibilityScoreCard(
                        modifier = Modifier.weight(1f),
                        title = stringResource(R.string.compatibility_friendship_score),
                        value = report.friendshipScore,
                        language = appLanguage,
                        brush =
                            Brush.horizontalGradient(
                                listOf(
                                    MaterialTheme.colorScheme.secondary,
                                    MaterialTheme.colorScheme.secondary.copy(alpha = 0.65f),
                                ),
                            ),
                    )
                    CompatibilityScoreCard(
                        modifier = Modifier.weight(1f),
                        title = stringResource(R.string.compatibility_work_score),
                        value = report.workScore,
                        language = appLanguage,
                        brush =
                            Brush.horizontalGradient(
                                listOf(
                                    MaterialTheme.colorScheme.tertiary,
                                    MaterialTheme.colorScheme.tertiary.copy(alpha = 0.65f),
                                ),
                            ),
                    )
                    CompatibilityScoreCard(
                        modifier = Modifier.weight(1f),
                        title = stringResource(R.string.compatibility_overall_score),
                        value = report.overallScore,
                        language = appLanguage,
                        brush =
                            Brush.horizontalGradient(
                                listOf(
                                    MaterialTheme.colorScheme.onSurface,
                                    MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f),
                                ),
                            ),
                    )
                }

                if (report.strengths.isNotEmpty() || report.challenges.isNotEmpty()) {
                    AstrologyCard {
                        if (report.strengths.isNotEmpty()) {
                            Text(
                                text = stringResource(R.string.compatibility_strengths_title),
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                            )
                            report.strengths.forEach { item ->
                                DetailChip(text = item)
                            }
                        }
                        if (report.challenges.isNotEmpty()) {
                            if (report.strengths.isNotEmpty()) {
                                Spacer(modifier = Modifier.height(6.dp))
                            }
                            Text(
                                text = stringResource(R.string.compatibility_challenges_title),
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                            )
                            report.challenges.forEach { item ->
                                DetailChip(text = item)
                            }
                        }
                    }
                }

                AstrologyCard {
                    if (report.advice == null) {
                        Box(
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .background(
                                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                                        shape = RoundedCornerShape(24.dp),
                                    ).padding(20.dp),
                        ) {
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Surface(
                                    shape = CircleShape,
                                    color = MaterialTheme.colorScheme.secondary.copy(alpha = 0.18f),
                                ) {
                                    Text(
                                        text = "🔒",
                                        modifier = Modifier.padding(14.dp),
                                        style = MaterialTheme.typography.titleLarge,
                                    )
                                }
                                Text(
                                    text = stringResource(R.string.compatibility_premium_title),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    text = stringResource(R.string.compatibility_premium_body),
                                    style = MaterialTheme.typography.bodyMedium,
                                    textAlign = TextAlign.Center,
                                )
                                Button(
                                    onClick = onOpenPremium,
                                    colors =
                                        ButtonDefaults.buttonColors(
                                            containerColor = MaterialTheme.colorScheme.primary,
                                            contentColor = MaterialTheme.colorScheme.onPrimary,
                                        ),
                                ) {
                                    Text(stringResource(R.string.compatibility_unlock_cta))
                                }
                            }
                        }
                    } else {
                        Text(
                            text = stringResource(R.string.compatibility_premium_title),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(report.advice)
                        if (report.famousCouples.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = stringResource(R.string.compatibility_famous_couples),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            report.famousCouples.forEach { couple ->
                                DetailChip(text = couple)
                            }
                        }
                    }
                }

                Button(
                    onClick = {
                        val shareLink =
                            compatibilityShareLandingUrl(uiState.mySign, uiState.selectedSign)
                                ?: return@Button
                        viewModel.onEvent(CompatibilityUiEvent.ShareClicked)
                        val shareText =
                            context.getString(
                                R.string.compatibility_share_message,
                                mySign.localizedName(appLanguage),
                                selectedSign.localizedName(appLanguage),
                                report.overallScore,
                                shareLink,
                            )
                        val intent =
                            Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_TEXT, shareText)
                            }
                        context.startActivity(
                            Intent.createChooser(intent, context.getString(R.string.compatibility_share_cta)),
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors =
                        ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant,
                            contentColor = MaterialTheme.colorScheme.onSurface,
                        ),
                ) {
                    Text(stringResource(R.string.compatibility_share_cta))
                }
            }

            if (uiState.showBannerAd && uiState.report != null) {
                AdaptiveBannerAd(modifier = Modifier.padding(top = 4.dp))
            }

            uiState.error?.let { ErrorState(message = it, onRetry = { viewModel.onEvent(CompatibilityUiEvent.Load) }) }
        }
    }
}

@Composable
private fun CompatibilitySignBubble(
    title: String,
    sign: ZodiacSign,
    language: String,
    active: Boolean,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Surface(
            modifier = Modifier.size(82.dp),
            shape = CircleShape,
            color =
                if (active) {
                    sign.element.color.copy(alpha = 0.86f)
                } else {
                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)
                },
            border =
                BorderStroke(
                    1.dp,
                    if (active) {
                        MaterialTheme.colorScheme.primary.copy(alpha = 0.22f)
                    } else {
                        MaterialTheme.colorScheme.secondary.copy(alpha = 0.22f)
                    },
                ),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    text = sign.symbol,
                    style = MaterialTheme.typography.headlineMedium,
                )
            }
        }
        Text(
            text = sign.localizedName(language),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

internal fun compatibilityScoreLabel(
    value: Int?,
    language: String,
    lockedLabel: String,
): String = value?.let { TimeUtils.formatPercentage(it, language) } ?: lockedLabel

@Suppress("FunctionNaming")
@Composable
private fun CompatibilityScoreCard(
    title: String,
    value: Int?,
    brush: Brush,
    language: String,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(22.dp),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.22f)),
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = compatibilityScoreLabel(value, language, stringResource(R.string.compatibility_score_locked)),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            value?.let { availableValue ->
                Box(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(8.dp)
                            .background(
                                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                                shape = RoundedCornerShape(999.dp),
                            ),
                ) {
                    Box(
                        modifier =
                            Modifier
                                .fillMaxWidth(availableValue.coerceIn(0, 100) / 100f)
                                .height(8.dp)
                                .background(brush, shape = RoundedCornerShape(999.dp)),
                    )
                }
            }
        }
    }
}
