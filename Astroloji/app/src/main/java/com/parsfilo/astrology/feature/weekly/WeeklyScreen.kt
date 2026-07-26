package com.parsfilo.astrology.feature.weekly

import android.app.Activity
import androidx.activity.compose.BackHandler
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
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.ads.AdaptiveBannerAd
import com.parsfilo.astrology.core.ads.RewardedAdRequest
import com.parsfilo.astrology.core.ads.adsEntryPoint
import com.parsfilo.astrology.core.ui.components.AstroSectionTitle
import com.parsfilo.astrology.core.ui.components.AstrologyCard
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.ui.components.ErrorState
import com.parsfilo.astrology.core.ui.components.LoadingState
import kotlinx.coroutines.launch

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
    val scope = rememberCoroutineScope()

    LaunchedEffect(viewModel, activity) {
        viewModel.effects.collect { effect ->
            when (effect) {
                is WeeklyUiEffect.ShowRewardAd -> {
                    val hostActivity = activity ?: return@collect
                    rewardedAdManager.showIfAvailable(
                        activity = hostActivity,
                        request =
                            RewardedAdRequest(
                                placement = "unlock_weekly_full",
                                ssvUserId = effect.challenge.userId,
                                ssvCustomData = effect.challenge.customData,
                            ),
                        onRewardEarned = {
                            viewModel.onEvent(WeeklyUiEvent.RewardEarned(effect.challenge.challengeId))
                        },
                    )
                }
            }
        }
    }

    BackHandler(enabled = activity != null) {
        val hostActivity = activity ?: return@BackHandler
        scope.launch {
            val flags = adsEntryPoint.remoteConfigRepository().fetchFlags()
            val canShowInterstitial =
                adsEntryPoint.adEligibilityChecker().canShowInterstitial() &&
                    adsEntryPoint.adFrequencyManager().canShowInterstitial(flags)
            if (!canShowInterstitial) {
                onNavigateBack()
                return@launch
            }
            val shown =
                adsEntryPoint.interstitialAdManager().showIfAvailable(
                    activity = hostActivity,
                    placement = "weekly_back",
                    onDismissed = onNavigateBack,
                )
            if (shown) {
                adsEntryPoint.adFrequencyManager().recordInterstitialShown()
            } else {
                onNavigateBack()
            }
        }
    }

    if (uiState.isLoading && uiState.weekly == null) {
        LoadingState()
        return
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

                    AstroSectionTitle(
                        title = stringResource(R.string.weekly_label_week, weekly.week),
                        eyebrow = "${weekly.weekStart} - ${weekly.weekEnd}",
                    )

                    AstrologyCard {
                        Text(
                            text = stringResource(R.string.weekly_best_day, weekly.bestDay ?: "-"),
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = stringResource(R.string.weekly_best_day_highlight),
                            style = MaterialTheme.typography.bodyMedium,
                        )
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
                    )
                    WeeklySectionCard(
                        title = stringResource(R.string.weekly_tab_career),
                        body = weekly.career ?: stringResource(R.string.weekly_premium_locked),
                        locked = weekly.career == null,
                        onOpenPremium = onOpenPremium,
                        rewardAction = rewardAction.takeIf { rewardSection == WeeklyPremiumSection.CAREER },
                    )
                    WeeklySectionCard(
                        title = stringResource(R.string.weekly_tab_money),
                        body = weekly.money ?: stringResource(R.string.weekly_premium_locked),
                        locked = weekly.money == null,
                        onOpenPremium = onOpenPremium,
                        rewardAction = rewardAction.takeIf { rewardSection == WeeklyPremiumSection.MONEY },
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

                uiState.error?.let { ErrorState(message = it, onRetry = { viewModel.onEvent(WeeklyUiEvent.Refresh) }) }
            }
        }
    }
}

@Composable
private fun WeeklySectionCard(
    title: String,
    body: String,
    locked: Boolean,
    onOpenPremium: () -> Unit,
    rewardAction: (() -> Unit)? = null,
) {
    AstrologyCard {
        Text(text = title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(text = body, style = MaterialTheme.typography.bodyLarge)
        if (locked) {
            Button(onClick = onOpenPremium) { Text(stringResource(R.string.common_open_premium)) }
            rewardAction?.let { unlockWithReward ->
                OutlinedButton(onClick = unlockWithReward) {
                    Text(stringResource(R.string.reward_unlock_weekly))
                }
            }
        }
    }
}
