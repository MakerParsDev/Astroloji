@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.domain.model.DailyHoroscope
import com.parsfilo.astrology.core.ui.components.PremiumGlassCard
import com.parsfilo.astrology.core.ui.components.PremiumGoldButton
import com.parsfilo.astrology.core.ui.components.PremiumHeroCard
import com.parsfilo.astrology.core.ui.components.PremiumIconTile
import com.parsfilo.astrology.core.ui.components.PremiumMetricRing
import com.parsfilo.astrology.core.ui.components.PremiumPill
import com.parsfilo.astrology.core.ui.components.PremiumSectionHeader
import com.parsfilo.astrology.core.ui.components.StreakBadge
import com.parsfilo.astrology.core.util.TimeUtils
import com.parsfilo.astrology.core.util.ZodiacSign

private const val QUICK_TILE_WIDTH_FRACTION = 0.48f
private const val SCORE_MAX = 100

@Suppress("LongParameterList", "LongMethod")
@Composable
internal fun HomePremiumDashboard(
    sign: ZodiacSign,
    language: String,
    greeting: String,
    dateLabel: String,
    streakCount: Int,
    daily: DailyHoroscope?,
    onOpenDaily: () -> Unit,
    onOpenWeekly: () -> Unit,
    onOpenMonthly: () -> Unit,
    onOpenPersonality: () -> Unit,
    onOpenPremium: () -> Unit,
    alertContent: (@Composable () -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val signName = sign.localizedName(language)
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        PremiumSectionHeader(
            eyebrow = stringResource(R.string.home_brand),
            title = stringResource(R.string.home_greeting_format, greeting, signName),
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = dateLabel,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            StreakBadge(count = streakCount)
        }
        alertContent?.invoke()
        PremiumHeroCard(
            symbol = sign.symbol,
            eyebrow = signName,
            title = stringResource(R.string.home_today_commentary),
            subtitle = sign.localizedDateRange(language),
        )
        PremiumSectionHeader(
            title = stringResource(R.string.home_quick_access),
        )
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            PremiumIconTile(
                icon = Icons.Outlined.AutoAwesome,
                label = stringResource(R.string.home_daily_button),
                onClick = onOpenDaily,
                modifier = Modifier.fillMaxWidth(QUICK_TILE_WIDTH_FRACTION),
            )
            PremiumIconTile(
                icon = Icons.Outlined.DateRange,
                label = stringResource(R.string.home_weekly_button),
                onClick = onOpenWeekly,
                modifier = Modifier.fillMaxWidth(QUICK_TILE_WIDTH_FRACTION),
            )
            PremiumIconTile(
                icon = Icons.Outlined.CalendarMonth,
                label = stringResource(R.string.home_monthly_button),
                onClick = onOpenMonthly,
                modifier = Modifier.fillMaxWidth(QUICK_TILE_WIDTH_FRACTION),
            )
            PremiumIconTile(
                icon = Icons.Outlined.Person,
                label = stringResource(R.string.home_personality_button),
                onClick = onOpenPersonality,
                modifier = Modifier.fillMaxWidth(QUICK_TILE_WIDTH_FRACTION),
            )
        }

        daily?.let { horoscope ->
            PremiumGlassCard {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PremiumMetricRing(
                        value = horoscope.energy,
                        label = stringResource(R.string.home_energy_label),
                    )
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        HomeInsightBar(
                            label = stringResource(R.string.compatibility_love_score),
                            value = horoscope.loveScore,
                            language = language,
                            accent = MaterialTheme.colorScheme.secondary,
                        )
                        HomeInsightBar(
                            label = stringResource(R.string.compatibility_work_score),
                            value = horoscope.careerScore,
                            language = language,
                            accent = MaterialTheme.colorScheme.tertiary,
                        )
                        HomeInsightBar(
                            label = stringResource(R.string.home_money_label),
                            value = horoscope.moneyScore,
                            language = language,
                            accent = MaterialTheme.colorScheme.primary,
                        )
                        HomeInsightBar(
                            label = stringResource(R.string.home_health_label),
                            value = horoscope.healthScore,
                            language = language,
                            accent = sign.element.color,
                        )
                    }
                }
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    PremiumPill(
                        text = "${stringResource(R.string.home_lucky_number_title)} · ${horoscope.luckyNumber}",
                    )
                    PremiumPill(
                        text = "${stringResource(R.string.home_lucky_color_title)} · ${horoscope.luckyColor}",
                    )
                }
            }

            PremiumGlassCard {
                PremiumSectionHeader(
                    title = stringResource(R.string.home_today_commentary),
                )
                Text(
                    text = horoscope.short,
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = horoscope.full ?: stringResource(R.string.home_unlock_caption),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (horoscope.full == null) {
                    Button(
                        onClick = onOpenPremium,
                        modifier = Modifier.fillMaxWidth(),
                        colors =
                            ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.secondaryContainer,
                                contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                            ),
                    ) {
                        Text(
                            text = stringResource(R.string.home_unlock_cta),
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
                PremiumGoldButton(
                    text = stringResource(R.string.home_view_details),
                    onClick = onOpenDaily,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Suppress("FunctionNaming")
@Composable
private fun HomeInsightBar(
    label: String,
    value: Int,
    language: String,
    accent: Color,
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
                        .fillMaxWidth(value.coerceIn(0, SCORE_MAX) / SCORE_MAX.toFloat())
                        .height(6.dp)
                        .background(accent, shape = RoundedCornerShape(999.dp)),
            )
        }
    }
}
