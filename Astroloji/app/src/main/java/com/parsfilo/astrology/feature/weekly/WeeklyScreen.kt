package com.parsfilo.astrology.feature.weekly

import android.app.Activity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.ads.AdaptiveBannerAd
import com.parsfilo.astrology.core.ads.InterstitialBackHandler
import com.parsfilo.astrology.core.ads.RewardedAdRequest
import com.parsfilo.astrology.core.ads.adsEntryPoint
import com.parsfilo.astrology.core.ui.components.AstrologyCard
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.ui.components.ErrorState
import com.parsfilo.astrology.core.ui.components.LoadingState
import com.parsfilo.astrology.core.ui.components.PremiumHeroCard
import com.parsfilo.astrology.core.util.TimeUtils
import com.parsfilo.astrology.core.util.ZodiacSign
import com.parsfilo.astrology.core.util.localizedReadingRange
import com.parsfilo.astrology.core.util.localizedReadingWeek

@Composable
fun WeeklyScreen(
    sign: String,
    onOpenPremium: () -> Unit,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: WeeklyViewModel = hiltViewModel(),
) {
    val uiState by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val activity = context as? Activity
    val adsEntryPoint = adsEntryPoint(context)
    val rewardedAdManager = adsEntryPoint.rewardedAdManager()
    val rewardedAdUnavailableMessage = stringResource(R.string.rewarded_ad_unavailable)
    val rewardedAdNotCompletedMessage = stringResource(R.string.rewarded_ad_not_completed)

    LaunchedEffect(viewModel, activity, rewardedAdUnavailableMessage, rewardedAdNotCompletedMessage) {
        viewModel.effects.collect { effect ->
            when (effect) {
                is WeeklyUiEffect.ShowRewardAd -> {
                    val unavailableMessage = rewardedAdUnavailableMessage
                    val hostActivity =
                        activity ?: run {
                            viewModel.onEvent(WeeklyUiEvent.RewardAdUnavailable(unavailableMessage))
                            return@collect
                        }
                    // A previously prepared challenge does not bypass a fresh premium/UMP decision.
                    if (!adsEntryPoint(context).adEligibilityChecker().canShowRewarded()) {
                        viewModel.onEvent(WeeklyUiEvent.RewardAdUnavailable(unavailableMessage))
                        return@collect
                    }
                    val shown =
                        rewardedAdManager.showIfAvailable(
                            activity = hostActivity,
                            request =
                                RewardedAdRequest(
                                    placement = "unlock_weekly_full",
                                    ssvUserId = effect.challenge.userId,
                                    ssvCustomData = effect.challenge.customData,
                                    expiresAtMillis = TimeUtils.parseIsoMillis(effect.challenge.expiresAt) ?: 0L,
                                ),
                            onRewardEarned = {
                                viewModel.onEvent(WeeklyUiEvent.RewardEarned(effect.challenge.challengeId))
                            },
                            onDismissedWithoutReward = {
                                viewModel.onEvent(WeeklyUiEvent.RewardAdUnavailable(rewardedAdNotCompletedMessage))
                            },
                        )
                    if (!shown) {
                        viewModel.onEvent(WeeklyUiEvent.RewardAdUnavailable(unavailableMessage))
                    }
                }
            }
        }
    }

    InterstitialBackHandler(
        activity = activity,
        placement = "weekly_back",
        onNavigateBack = onNavigateBack,
    )

    if (uiState.isLoading && uiState.weekly == null) {
        LoadingState()
        return
    }

    // Keep ad failure feedback visible even when the locked card is far above the
    // inline retry section at the end of this long reading.
    val snackbarHostState = remember { SnackbarHostState() }
    LaunchedEffect(uiState.error, uiState.weekly) {
        if (uiState.weekly != null) {
            uiState.error?.let { snackbarHostState.showSnackbar(it, duration = SnackbarDuration.Long) }
        }
    }

    PullToRefreshBox(
        isRefreshing = uiState.isRefreshing,
        onRefresh = { viewModel.onEvent(WeeklyUiEvent.Refresh) },
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
                if (uiState.isRefreshing) {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                }

                uiState.weekly?.let { weekly ->
                    val rewardedActivity = activity
                    val rewardSection =
                        firstLockedWeeklyPremiumSection(weekly)
                            .takeIf { uiState.canUnlockWithReward && rewardedActivity != null }
                    val rewardAction: (() -> Unit)? =
                        if (rewardSection != null && rewardedActivity != null) {
                            { viewModel.onEvent(WeeklyUiEvent.UnlockWithReward) }
                        } else {
                            null
                        }
                    val rewardLabel =
                        if (uiState.pendingRewardChallengeId != null) {
                            stringResource(R.string.common_retry)
                        } else {
                            stringResource(R.string.reward_unlock_weekly)
                        }

                    val weeklySign = ZodiacSign.fromKey(weekly.sign)
                    PremiumHeroCard(
                        symbol = weeklySign.symbol,
                        eyebrow = weeklySign.localizedName(weekly.language),
                        title = stringResource(R.string.weekly_label_week, localizedReadingWeek(weekly.week)),
                        subtitle = localizedReadingRange(weekly.weekStart, weekly.weekEnd, weekly.language),
                    )

                    // The API intentionally hides the best day for free users.
                    // Do not render a misleading "Best day: -" placeholder.
                    weekly.bestDay?.takeIf { it.isNotBlank() }?.let { bestDay ->
                        AstrologyCard {
                            Text(
                                text = stringResource(R.string.weekly_best_day, bestDay),
                                style = MaterialTheme.typography.headlineSmall,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = stringResource(R.string.weekly_best_day_highlight),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }

                    WeeklySectionCard(
                        title = stringResource(R.string.weekly_tab_overview),
                        body = weekly.summary ?: stringResource(R.string.weekly_premium_locked),
                        locked = weekly.summary == null,
                        onOpenPremium = onOpenPremium,
                    )
                    WeeklySectionCard(
                        title = stringResource(R.string.weekly_tab_love),
                        body = weekly.love ?: stringResource(R.string.weekly_premium_locked),
                        locked = weekly.love == null,
                        onOpenPremium = onOpenPremium,
                        rewardAction = rewardAction.takeIf { rewardSection == WeeklyPremiumSection.LOVE },
                        rewardLabel = rewardLabel,
                    )
                    WeeklySectionCard(
                        title = stringResource(R.string.weekly_tab_career),
                        body = weekly.career ?: stringResource(R.string.weekly_premium_locked),
                        locked = weekly.career == null,
                        onOpenPremium = onOpenPremium,
                        rewardAction = rewardAction.takeIf { rewardSection == WeeklyPremiumSection.CAREER },
                        rewardLabel = rewardLabel,
                    )
                    WeeklySectionCard(
                        title = stringResource(R.string.weekly_tab_money),
                        body = weekly.money ?: stringResource(R.string.weekly_premium_locked),
                        locked = weekly.money == null,
                        onOpenPremium = onOpenPremium,
                        rewardAction = rewardAction.takeIf { rewardSection == WeeklyPremiumSection.MONEY },
                        rewardLabel = rewardLabel,
                    )
                    weekly.warning?.let {
                        AstrologyCard {
                            Text(
                                text = stringResource(R.string.weekly_warning, it),
                                style = MaterialTheme.typography.bodyLarge,
                            )
                        }
                    }
                }

                if (uiState.showBannerAd) {
                    AdaptiveBannerAd(modifier = Modifier.padding(top = 4.dp))
                }

                uiState.error?.let {
                    ErrorState(
                        message = it,
                        onRetry = {
                            viewModel.onEvent(
                                if (uiState.pendingRewardChallengeId != null) {
                                    WeeklyUiEvent.RetryRewardVerification
                                } else {
                                    WeeklyUiEvent.Refresh
                                },
                            )
                        },
                    )
                }
            }
            SnackbarHost(
                hostState = snackbarHostState,
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 88.dp),
            )
        }
    }
}

@Composable
@Suppress("FunctionNaming", "LongParameterList")
private fun WeeklySectionCard(
    title: String,
    body: String,
    locked: Boolean,
    onOpenPremium: () -> Unit,
    rewardAction: (() -> Unit)? = null,
    rewardLabel: String = "",
) {
    AstrologyCard {
        Text(text = title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(text = body, style = MaterialTheme.typography.bodyLarge)
        if (locked) {
            Button(onClick = onOpenPremium) { Text(stringResource(R.string.common_open_premium)) }
            rewardAction?.let { unlockWithReward ->
                OutlinedButton(onClick = unlockWithReward) {
                    Text(rewardLabel)
                }
            }
        }
    }
}
