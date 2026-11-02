@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.monthly

import android.app.Activity
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
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
import com.parsfilo.astrology.core.ui.components.AstrologyCard
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.ui.components.ErrorState
import com.parsfilo.astrology.core.ui.components.LoadingState
import com.parsfilo.astrology.core.ui.components.PremiumHeroCard
import com.parsfilo.astrology.core.ui.components.PremiumUnlockCallout
import com.parsfilo.astrology.core.util.ZodiacSign
import com.parsfilo.astrology.core.util.localizedReadingMonth
import com.parsfilo.astrology.core.util.localizedReadingRange
import com.parsfilo.astrology.core.util.readingCalendarDays

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

    InterstitialBackHandler(
        activity = activity,
        placement = "monthly_back",
        onNavigateBack = onNavigateBack,
    )

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
                    val monthlySign = ZodiacSign.fromKey(monthly.sign)
                    PremiumHeroCard(
                        symbol = monthlySign.symbol,
                        eyebrow = monthlySign.localizedName(monthly.language),
                        title =
                            stringResource(
                                R.string.monthly_label_month,
                                localizedReadingMonth(monthly.month, monthly.language),
                            ),
                        subtitle =
                            localizedReadingRange(
                                monthly.monthStart,
                                monthly.monthEnd,
                                monthly.language,
                            ) ?: localizedReadingMonth(monthly.month, monthly.language),
                    )

                    MonthlySectionCard(
                        title = stringResource(R.string.weekly_tab_overview),
                        body = monthly.summary ?: stringResource(R.string.monthly_premium_locked),
                    )
                    MonthlySectionCard(
                        title = stringResource(R.string.weekly_tab_love),
                        body = monthly.love ?: stringResource(R.string.monthly_premium_locked),
                    )
                    MonthlySectionCard(
                        title = stringResource(R.string.weekly_tab_career),
                        body = monthly.career ?: stringResource(R.string.monthly_premium_locked),
                    )
                    MonthlySectionCard(
                        title = stringResource(R.string.weekly_tab_money),
                        body = monthly.money ?: stringResource(R.string.monthly_premium_locked),
                    )

                    if (listOf(monthly.summary, monthly.love, monthly.career, monthly.money).any { it == null }) {
                        PremiumUnlockCallout(onOpenPremium = onOpenPremium)
                    }

                    val dayRange = readingCalendarDays(monthly.monthStart, monthly.monthEnd)
                    if (dayRange.isNotEmpty()) {
                        AstrologyCard {
                            Text(
                                text = stringResource(R.string.monthly_calendar_title),
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                            )
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
) {
    AstrologyCard {
        Text(text = title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(text = body, style = MaterialTheme.typography.bodyLarge)
    }
}
