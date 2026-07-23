package com.parsfilo.astrology.feature.monthly

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
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
import com.parsfilo.astrology.core.ads.adsEntryPoint
import com.parsfilo.astrology.core.ui.components.AstroSectionTitle
import com.parsfilo.astrology.core.ui.components.AstrologyCard
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.ui.components.ErrorState
import com.parsfilo.astrology.core.ui.components.LoadingState
import kotlinx.coroutines.launch
import java.time.LocalDate

@Composable
fun MonthlyScreen(
    sign: String,
    onOpenPremium: () -> Unit,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: MonthlyViewModel = hiltViewModel(),
) {
    val uiState by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val activity = context as? Activity
    val adsEntryPoint = adsEntryPoint(context)
    val scope = rememberCoroutineScope()

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
                    placement = "monthly_back",
                    onDismissed = onNavigateBack,
                )
            if (shown) {
                adsEntryPoint.adFrequencyManager().recordInterstitialShown()
            } else {
                onNavigateBack()
            }
        }
    }

    if (uiState.isLoading && uiState.monthly == null) {
        LoadingState()
        return
    }

    PullToRefreshBox(
        isRefreshing = uiState.isRefreshing,
        onRefresh = { viewModel.onEvent(MonthlyUiEvent.Refresh) },
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

                uiState.monthly?.let { monthly ->
                    AstroSectionTitle(
                        title = stringResource(R.string.monthly_label_month, monthly.month),
                        eyebrow =
                            if (monthly.monthStart != null && monthly.monthEnd != null) {
                                stringResource(R.string.monthly_range_label, monthly.monthStart, monthly.monthEnd)
                            } else {
                                monthly.month
                            },
                    )

                    MonthlySectionCard(
                        title = stringResource(R.string.weekly_tab_overview),
                        body = monthly.summary ?: stringResource(R.string.monthly_premium_locked),
                        locked = monthly.summary == null,
                        onOpenPremium = onOpenPremium,
                    )
                    MonthlySectionCard(
                        title = stringResource(R.string.weekly_tab_love),
                        body = monthly.love ?: stringResource(R.string.monthly_premium_locked),
                        locked = monthly.love == null,
                        onOpenPremium = onOpenPremium,
                    )
                    MonthlySectionCard(
                        title = stringResource(R.string.weekly_tab_career),
                        body = monthly.career ?: stringResource(R.string.monthly_premium_locked),
                        locked = monthly.career == null,
                        onOpenPremium = onOpenPremium,
                    )
                    MonthlySectionCard(
                        title = stringResource(R.string.weekly_tab_money),
                        body = monthly.money ?: stringResource(R.string.monthly_premium_locked),
                        locked = monthly.money == null,
                        onOpenPremium = onOpenPremium,
                    )

                    AstrologyCard {
                        Text(
                            text = stringResource(R.string.monthly_calendar_title),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                        )
                        val dayRange =
                            if (monthly.monthStart != null && monthly.monthEnd != null) {
                                val start = LocalDate.parse(monthly.monthStart)
                                val end = LocalDate.parse(monthly.monthEnd)
                                start.dayOfMonth..end.dayOfMonth
                            } else {
                                1..30
                            }
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            dayRange.forEach { day ->
                                Text(
                                    text = day.toString(),
                                    modifier =
                                        Modifier
                                            .background(
                                                MaterialTheme.colorScheme.surfaceVariant,
                                                CircleShape,
                                            ).padding(horizontal = 10.dp, vertical = 8.dp),
                                )
                            }
                        }
                    }
                }

                if (uiState.showBannerAd) {
                    AdaptiveBannerAd(modifier = Modifier.padding(top = 4.dp))
                }

                uiState.error?.let { ErrorState(message = it, onRetry = { viewModel.onEvent(MonthlyUiEvent.Refresh) }) }
            }
        }
    }
}

@Composable
private fun MonthlySectionCard(
    title: String,
    body: String,
    locked: Boolean,
    onOpenPremium: () -> Unit,
) {
    AstrologyCard {
        Text(text = title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(text = body, style = MaterialTheme.typography.bodyLarge)
        if (locked) {
            Button(onClick = onOpenPremium) { Text(stringResource(R.string.common_open_premium)) }
        }
    }
}
