package com.parsfilo.astrology.feature.daily

import android.app.Activity
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.core.app.ShareCompat
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
import com.parsfilo.astrology.core.util.HoroscopeCardRenderer
import com.parsfilo.astrology.core.util.TimeUtils
import com.parsfilo.astrology.core.util.ZodiacSign
import com.parsfilo.astrology.navigation.dailyShareLandingUrl
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun DailyScreen(
    sign: String,
    onOpenPremium: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DailyViewModel = hiltViewModel(),
) {
    val uiState by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val activity = context as? Activity
    val shareScope = rememberCoroutineScope()
    val rewardedAdManager = adsEntryPoint(context).rewardedAdManager()

    LaunchedEffect(viewModel, activity) {
        viewModel.effects.collect { effect ->
            when (effect) {
                is DailyUiEffect.ShowRewardAd -> {
                    val unavailableMessage = context.getString(R.string.rewarded_ad_unavailable)
                    val hostActivity =
                        activity ?: run {
                            viewModel.onEvent(DailyUiEvent.RewardAdUnavailable(unavailableMessage))
                            return@collect
                        }
                    val shown =
                        rewardedAdManager.showIfAvailable(
                            activity = hostActivity,
                            request =
                                RewardedAdRequest(
                                    placement = "unlock_daily_full",
                                    ssvUserId = effect.challenge.userId,
                                    ssvCustomData = effect.challenge.customData,
                                ),
                            onRewardEarned = {
                                viewModel.onEvent(DailyUiEvent.RewardEarned(effect.challenge.challengeId))
                            },
                        )
                    if (!shown) {
                        viewModel.onEvent(DailyUiEvent.RewardAdUnavailable(unavailableMessage))
                    }
                }
            }
        }
    }

    if (uiState.isLoading && uiState.horoscope == null) {
        LoadingState()
        return
    }

    PullToRefreshBox(
        isRefreshing = uiState.isRefreshing,
        onRefresh = { viewModel.onEvent(DailyUiEvent.Refresh) },
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

                uiState.horoscope?.let { horoscope ->
                    AstroSectionTitle(
                        title = stringResource(R.string.daily_title),
                        eyebrow = TimeUtils.displayDate(horoscope.language),
                    )

                    if (activity != null) {
                        OutlinedButton(
                            onClick = {
                                viewModel.onEvent(DailyUiEvent.ShareClicked)
                                shareScope.launch {
                                    runCatching {
                                        val shareLink =
                                            dailyShareLandingUrl(horoscope.sign)
                                                ?: error("Unsupported zodiac sign for sharing.")
                                        val shareUri =
                                            withContext(Dispatchers.IO) {
                                                HoroscopeCardRenderer.renderDailyCard(activity, horoscope)
                                            }
                                        val signName =
                                            ZodiacSign
                                                .fromKey(horoscope.sign)
                                                .localizedName(horoscope.language)
                                        val intent =
                                            ShareCompat
                                                .IntentBuilder(activity)
                                                .setType("image/png")
                                                .setStream(shareUri)
                                                .setText(
                                                    activity.getString(
                                                        R.string.daily_share_message,
                                                        signName,
                                                        horoscope.short,
                                                        shareLink,
                                                    ),
                                                ).intent
                                                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                        activity.startActivity(
                                            Intent.createChooser(
                                                intent,
                                                activity.getString(R.string.daily_share_card),
                                            ),
                                        )
                                    }.onFailure {
                                        Toast
                                            .makeText(context, R.string.daily_share_error, Toast.LENGTH_SHORT)
                                            .show()
                                    }
                                }
                            },
                        ) {
                            Text(stringResource(R.string.daily_share_card))
                        }
                    }

                    AstrologyCard {
                        Text(
                            text = horoscope.short,
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        DailyInsightBar(
                            label = stringResource(R.string.home_energy_label),
                            value = horoscope.energy,
                            language = horoscope.language,
                        )
                        DailyInsightBar(
                            label = stringResource(R.string.compatibility_love_score),
                            value = horoscope.loveScore,
                            language = horoscope.language,
                        )
                        DailyInsightBar(
                            label = stringResource(R.string.compatibility_work_score),
                            value = horoscope.careerScore,
                            language = horoscope.language,
                        )
                        DailyInsightBar(
                            label = stringResource(R.string.home_money_label),
                            value = horoscope.moneyScore,
                            language = horoscope.language,
                        )
                        DailyInsightBar(
                            label = stringResource(R.string.home_health_label),
                            value = horoscope.healthScore,
                            language = horoscope.language,
                        )
                    }

                    DailySectionCard(
                        title = stringResource(R.string.daily_section_overview),
                        body = horoscope.full ?: stringResource(R.string.daily_premium_locked),
                        locked = horoscope.full == null,
                        onOpenPremium = onOpenPremium,
                        rewardAction =
                            if (horoscope.full == null && uiState.canUnlockWithReward && activity != null) {
                                { viewModel.onEvent(DailyUiEvent.UnlockWithReward) }
                            } else {
                                null
                            },
                    )
                    DailySectionCard(
                        title = stringResource(R.string.daily_section_love),
                        body = horoscope.love ?: stringResource(R.string.daily_love_locked),
                        locked = horoscope.love == null,
                        onOpenPremium = onOpenPremium,
                    )
                    DailySectionCard(
                        title = stringResource(R.string.daily_section_career),
                        body = horoscope.career ?: stringResource(R.string.daily_career_locked),
                        locked = horoscope.career == null,
                        onOpenPremium = onOpenPremium,
                    )
                    DailySectionCard(
                        title = stringResource(R.string.daily_section_money),
                        body = horoscope.money ?: stringResource(R.string.daily_money_locked),
                        locked = horoscope.money == null,
                        onOpenPremium = onOpenPremium,
                    )
                    DailySectionCard(
                        title = stringResource(R.string.daily_section_health),
                        body = horoscope.health ?: stringResource(R.string.daily_health_locked),
                        locked = horoscope.health == null,
                        onOpenPremium = onOpenPremium,
                    )
                    horoscope.dailyTip?.let {
                        DailySectionCard(
                            title = stringResource(R.string.daily_section_tip),
                            body = it,
                            locked = false,
                            onOpenPremium = onOpenPremium,
                        )
                    }
                    DailyFeedbackCard(
                        feedback = uiState.feedback,
                        onFeedback = { viewModel.onEvent(DailyUiEvent.SubmitFeedback(it)) },
                    )
                }

                if (uiState.showBannerAd) {
                    AdaptiveBannerAd(modifier = Modifier.padding(top = 4.dp))
                }

                uiState.error?.let { ErrorState(message = it, onRetry = { viewModel.onEvent(DailyUiEvent.Refresh) }) }
            }
        }
    }
}

@Composable
private fun DailySectionCard(
    title: String,
    body: String,
    locked: Boolean,
    onOpenPremium: () -> Unit,
    rewardAction: (() -> Unit)? = null,
) {
    AstrologyCard {
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        Text(text = body, style = MaterialTheme.typography.bodyLarge)
        if (locked) {
            Button(onClick = onOpenPremium) { Text(stringResource(R.string.common_open_premium)) }
            rewardAction?.let { unlockWithReward ->
                OutlinedButton(onClick = unlockWithReward) {
                    Text(stringResource(R.string.reward_unlock_daily))
                }
            }
        }
    }
}

@Composable
private fun DailyInsightBar(
    label: String,
    value: Int,
    language: String,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(text = label, style = MaterialTheme.typography.labelLarge)
            Text(text = TimeUtils.formatPercentage(value, language), style = MaterialTheme.typography.labelLarge)
        }
        Box(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(999.dp)),
        ) {
            Box(
                modifier =
                    Modifier
                        .fillMaxWidth(value.coerceIn(0, 100) / 100f)
                        .height(8.dp)
                        .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(999.dp)),
            )
        }
    }
}
