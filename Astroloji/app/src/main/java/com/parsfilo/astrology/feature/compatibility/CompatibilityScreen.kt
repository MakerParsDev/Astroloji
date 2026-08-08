package com.parsfilo.astrology.feature.compatibility

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import com.parsfilo.astrology.core.ui.components.PremiumSectionHeader
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
            PremiumSectionHeader(
                eyebrow = stringResource(R.string.home_brand),
                title = stringResource(R.string.compatibility_title),
            )

            AstrologyCard {
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
                CompatibilityPremiumSummary(
                    mySign = mySign,
                    selectedSign = selectedSign,
                    report = report,
                    language = appLanguage,
                )

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

                val shareLink = compatibilityShareLandingUrl(uiState.mySign, uiState.selectedSign)
                val shareText =
                    shareLink?.let { link ->
                        stringResource(
                            R.string.compatibility_share_message,
                            mySign.localizedName(appLanguage),
                            selectedSign.localizedName(appLanguage),
                            report.overallScore,
                            link,
                        )
                    }
                val shareChooserTitle = stringResource(R.string.compatibility_share_cta)
                Button(
                    onClick = {
                        val resolvedShareText = shareText ?: return@Button
                        viewModel.onEvent(CompatibilityUiEvent.ShareClicked)
                        val intent =
                            Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_TEXT, resolvedShareText)
                            }
                        context.startActivity(Intent.createChooser(intent, shareChooserTitle))
                    },
                    enabled = shareText != null,
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

internal fun compatibilityScoreLabel(
    value: Int?,
    language: String,
    lockedLabel: String,
): String = value?.let { TimeUtils.formatPercentage(it, language) } ?: lockedLabel
