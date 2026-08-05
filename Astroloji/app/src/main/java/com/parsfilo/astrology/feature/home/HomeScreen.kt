package com.parsfilo.astrology.feature.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.ads.AdaptiveBannerAd
import com.parsfilo.astrology.core.ui.components.AstroSectionTitle
import com.parsfilo.astrology.core.ui.components.AstrologyCard
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.ui.components.DetailChip
import com.parsfilo.astrology.core.ui.components.ErrorState
import com.parsfilo.astrology.core.ui.components.LoadingState
import com.parsfilo.astrology.core.ui.components.StreakBadge
import com.parsfilo.astrology.core.util.MoonPhase
import com.parsfilo.astrology.core.util.MoonPhaseCalculator
import com.parsfilo.astrology.core.util.TimeUtils
import com.parsfilo.astrology.core.util.ZodiacSign
import com.parsfilo.astrology.core.util.openSubscriptionManagement
import java.time.LocalDate
import java.time.ZoneOffset

@Composable
fun HomeScreen(
    onOpenDaily: (String) -> Unit,
    onOpenWeekly: (String) -> Unit,
    onOpenMonthly: (String) -> Unit,
    onOpenPersonality: (String) -> Unit,
    onOpenPremium: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val uiState by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    if (uiState.isLoading) {
        LoadingState()
        return
    }

    PullToRefreshBox(
        isRefreshing = uiState.isRefreshing,
        onRefresh = { viewModel.onEvent(HomeUiEvent.Refresh) },
        modifier = modifier.fillMaxSize(),
    ) {
        CosmicBackground(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                val profile = uiState.profile
                val configuration = LocalConfiguration.current
                val language = TimeUtils.normalizeLanguageTag(configuration.locales[0].language)
                val sign = ZodiacSign.fromKey(profile?.sign ?: "aries")
                val signName = sign.localizedName(language)
                val moonPhase =
                    MoonPhaseCalculator.calculate(
                        LocalDate.now(ZoneOffset.ofHours(profile?.utcOffset ?: 0)),
                    )
                val greeting =
                    when (TimeUtils.greetingKey()) {
                        "greeting_morning" -> stringResource(R.string.greeting_morning)
                        "greeting_afternoon" -> stringResource(R.string.greeting_afternoon)
                        else -> stringResource(R.string.greeting_evening)
                    }

                AstroSectionTitle(
                    title = stringResource(R.string.home_greeting_format, greeting, signName),
                    eyebrow = stringResource(R.string.home_brand),
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = TimeUtils.displayDate(language),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    StreakBadge(count = uiState.streakCount)
                }

                uiState.profile?.subscriptionState?.takeIf { it == "grace_period" || it == "on_hold" }?.let { subscriptionState ->
                    SubscriptionWarningCard(
                        subscriptionState = subscriptionState,
                        onManageSubscription = { openSubscriptionManagement(context) },
                    )
                }

                MoonPhaseBar(
                    phase = moonPhase.phase,
                    illuminationPercent = moonPhase.illuminationPercent,
                )

                uiState.daily?.let { daily ->
                    AstrologyCard {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(18.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                modifier =
                                    Modifier
                                        .weight(0.95f)
                                        .aspectRatio(1f),
                                contentAlignment = Alignment.Center,
                            ) {
                                CircularProgressIndicator(
                                    progress = { daily.energy / 100f },
                                    modifier = Modifier.fillMaxSize(),
                                    color = MaterialTheme.colorScheme.primary,
                                    trackColor = MaterialTheme.colorScheme.surfaceVariant,
                                    strokeWidth = 10.dp,
                                )
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(
                                        text = TimeUtils.formatPercentage(daily.energy, language),
                                        style = MaterialTheme.typography.displayLarge,
                                        color = MaterialTheme.colorScheme.secondary,
                                    )
                                    Text(
                                        text = stringResource(R.string.home_energy_label),
                                        style = MaterialTheme.typography.labelLarge,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }

                            Column(
                                modifier = Modifier.weight(1.25f),
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                InsightBar(
                                    label = stringResource(R.string.compatibility_love_score),
                                    value = daily.loveScore,
                                    accent = MaterialTheme.colorScheme.primary,
                                    language = language,
                                )
                                InsightBar(
                                    label = stringResource(R.string.home_money_label),
                                    value = daily.moneyScore,
                                    accent = MaterialTheme.colorScheme.secondary,
                                    language = language,
                                )
                                InsightBar(
                                    label = stringResource(R.string.compatibility_work_score),
                                    value = daily.careerScore,
                                    accent = MaterialTheme.colorScheme.tertiary,
                                    language = language,
                                )
                                InsightBar(
                                    label = stringResource(R.string.home_health_label),
                                    value = daily.healthScore,
                                    accent = sign.element.color,
                                    language = language,
                                )
                            }
                        }

                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            HomeMiniInfoCard(
                                title = stringResource(R.string.home_lucky_number_title),
                                value = daily.luckyNumber.toString(),
                            )
                            HomeMiniInfoCard(
                                title = stringResource(R.string.home_lucky_color_title),
                                value = daily.luckyColor,
                            )
                        }
                    }

                    AstrologyCard {
                        Text(
                            text = stringResource(R.string.home_today_commentary),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = daily.short,
                            style = MaterialTheme.typography.headlineMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Text(
                            text = daily.full ?: stringResource(R.string.home_unlock_caption),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )

                        if (daily.full == null) {
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(22.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)),
                            ) {
                                Column(
                                    modifier = Modifier.padding(18.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    Surface(
                                        shape = CircleShape,
                                        color = MaterialTheme.colorScheme.secondary.copy(alpha = 0.18f),
                                    ) {
                                        Text(
                                            text = "🔒",
                                            modifier = Modifier.padding(12.dp),
                                            style = MaterialTheme.typography.titleLarge,
                                        )
                                    }
                                    Text(
                                        text = stringResource(R.string.home_unlock_more),
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Button(
                                        onClick = onOpenPremium,
                                        colors =
                                            ButtonDefaults.buttonColors(
                                                containerColor = MaterialTheme.colorScheme.primary,
                                                contentColor = MaterialTheme.colorScheme.onPrimary,
                                            ),
                                    ) {
                                        Text(stringResource(R.string.home_unlock_cta))
                                    }
                                }
                            }
                        }

                        Button(
                            onClick = { onOpenDaily(daily.sign) },
                            colors =
                                ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.primary,
                                    contentColor = MaterialTheme.colorScheme.onPrimary,
                                ),
                        ) {
                            Text(stringResource(R.string.home_view_details))
                        }
                    }

                    daily.dailyTip?.let {
                        AstrologyCard {
                            Text(
                                text = stringResource(R.string.home_do_this_today),
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(text = it, style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                }

                if (uiState.streakCount > 0) {
                    AstrologyCard {
                        Text(
                            text = stringResource(R.string.home_streak_title),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text =
                                if (uiState.streakCount >= 30) {
                                    pluralStringResource(
                                        R.plurals.home_streak_month_message,
                                        uiState.streakCount,
                                        uiState.streakCount,
                                    )
                                } else if (uiState.streakCount >= 7) {
                                    pluralStringResource(
                                        R.plurals.home_streak_week_message,
                                        uiState.streakCount,
                                        uiState.streakCount,
                                    )
                                } else {
                                    pluralStringResource(
                                        R.plurals.home_streak_message,
                                        uiState.streakCount,
                                        uiState.streakCount,
                                    )
                                },
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                }

                AnimatedVisibility(
                    visible = uiState.achievedMilestone != null,
                    enter = fadeIn() + scaleIn(),
                ) {
                    uiState.achievedMilestone?.let { milestone ->
                        MilestoneCelebrationCard(milestone = milestone)
                    }
                }

                uiState.weekly?.let { weekly ->
                    AstrologyCard {
                        Text(
                            text = stringResource(R.string.home_weekly_summary),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(weekly.summary.orEmpty(), style = MaterialTheme.typography.bodyLarge)
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Button(onClick = { onOpenWeekly(weekly.sign) }) {
                                Text(stringResource(R.string.home_weekly_button))
                            }
                            Button(onClick = { onOpenMonthly(weekly.sign) }) {
                                Text(stringResource(R.string.home_monthly_button))
                            }
                            Button(onClick = { onOpenPersonality(weekly.sign) }) {
                                Text(stringResource(R.string.home_personality_button))
                            }
                        }
                    }
                }

                if (uiState.favorites.isNotEmpty()) {
                    AstrologyCard {
                        Text(
                            text = stringResource(R.string.home_favorite_signs),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                        )
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            uiState.favorites.forEach { favorite ->
                                DetailChip(
                                    text = ZodiacSign.fromKey(favorite).localizedName(language),
                                    modifier = Modifier,
                                )
                            }
                        }
                    }
                }

                if (uiState.showBannerAd) {
                    AdaptiveBannerAd()
                }

                uiState.error?.let { ErrorState(message = it, onRetry = { viewModel.onEvent(HomeUiEvent.Refresh) }) }
                Spacer(modifier = Modifier.height(12.dp))
            }
        }
    }
}

@Composable
private fun MoonPhaseBar(
    phase: MoonPhase,
    illuminationPercent: Int,
) {
    AstrologyCard {
        Text(
            text = stringResource(R.string.home_moon_phase_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "${phase.emoji} ${stringResource(moonPhaseNameRes(phase))}",
                    style = MaterialTheme.typography.headlineSmall,
                )
                Text(
                    text = stringResource(moonPhaseMessageRes(phase)),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.8f),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)),
            ) {
                Text(
                    text = "$illuminationPercent%",
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@Composable
private fun MilestoneCelebrationCard(milestone: Int) {
    AstrologyCard {
        Text(
            text = stringResource(R.string.home_streak_milestone_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = "✨ ${stringResource(streakMilestoneRes(milestone))}",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.secondary,
        )
    }
}

private fun moonPhaseNameRes(phase: MoonPhase): Int =
    when (phase) {
        MoonPhase.NEW -> R.string.moon_phase_new
        MoonPhase.WAXING_CRESCENT -> R.string.moon_phase_waxing_crescent
        MoonPhase.FIRST_QUARTER -> R.string.moon_phase_first_quarter
        MoonPhase.WAXING_GIBBOUS -> R.string.moon_phase_waxing_gibbous
        MoonPhase.FULL -> R.string.moon_phase_full
        MoonPhase.WANING_GIBBOUS -> R.string.moon_phase_waning_gibbous
        MoonPhase.LAST_QUARTER -> R.string.moon_phase_last_quarter
        MoonPhase.WANING_CRESCENT -> R.string.moon_phase_waning_crescent
    }

private fun moonPhaseMessageRes(phase: MoonPhase): Int =
    when (phase) {
        MoonPhase.NEW -> R.string.moon_phase_message_new
        MoonPhase.WAXING_CRESCENT -> R.string.moon_phase_message_waxing_crescent
        MoonPhase.FIRST_QUARTER -> R.string.moon_phase_message_first_quarter
        MoonPhase.WAXING_GIBBOUS -> R.string.moon_phase_message_waxing_gibbous
        MoonPhase.FULL -> R.string.moon_phase_message_full
        MoonPhase.WANING_GIBBOUS -> R.string.moon_phase_message_waning_gibbous
        MoonPhase.LAST_QUARTER -> R.string.moon_phase_message_last_quarter
        MoonPhase.WANING_CRESCENT -> R.string.moon_phase_message_waning_crescent
    }

private fun streakMilestoneRes(milestone: Int): Int =
    when (milestone) {
        3 -> R.string.streak_milestone_3
        7 -> R.string.streak_milestone_7
        14 -> R.string.streak_milestone_14
        30 -> R.string.streak_milestone_30
        60 -> R.string.streak_milestone_60
        else -> R.string.streak_milestone_100
    }

@Composable
private fun SubscriptionWarningCard(
    subscriptionState: String,
    onManageSubscription: () -> Unit,
) {
    val messageRes =
        if (subscriptionState == "on_hold") {
            R.string.home_subscription_on_hold_warning
        } else {
            R.string.home_subscription_grace_period_warning
        }

    Surface(
        shape = RoundedCornerShape(22.dp),
        color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.92f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.28f)),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = stringResource(messageRes),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onErrorContainer,
            )
            Button(
                onClick = onManageSubscription,
                colors =
                    ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error,
                        contentColor = MaterialTheme.colorScheme.onError,
                    ),
            ) {
                Text(stringResource(R.string.home_subscription_fix_action))
            }
        }
    }
}

@Suppress("FunctionNaming")
@Composable
private fun InsightBar(
    label: String,
    value: Int,
    accent: Color,
    language: String,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = label.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = TimeUtils.formatPercentage(value, language),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
        Box(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .background(
                        MaterialTheme.colorScheme.surfaceVariant,
                        shape = RoundedCornerShape(999.dp),
                    ),
        ) {
            Box(
                modifier =
                    Modifier
                        .fillMaxWidth(value.coerceIn(0, 100) / 100f)
                        .height(6.dp)
                        .background(accent, shape = RoundedCornerShape(999.dp)),
            )
        }
    }
}

@Composable
private fun HomeMiniInfoCard(
    title: String,
    value: String,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(0.48f),
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.75f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.8f)),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}
