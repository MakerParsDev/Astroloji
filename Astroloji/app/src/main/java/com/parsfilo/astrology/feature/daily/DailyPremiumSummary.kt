@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.daily

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.domain.model.DailyHoroscope
import com.parsfilo.astrology.core.ui.components.PremiumGlassCard
import com.parsfilo.astrology.core.ui.components.PremiumHeroCard
import com.parsfilo.astrology.core.ui.components.PremiumMetricRing
import com.parsfilo.astrology.core.ui.components.PremiumPill
import com.parsfilo.astrology.core.ui.components.PremiumSectionHeader
import com.parsfilo.astrology.core.util.TimeUtils
import com.parsfilo.astrology.core.util.ZodiacSign

private const val SCORE_MAX = 100

@Suppress("LongMethod")
@Composable
internal fun DailyPremiumSummary(
    horoscope: DailyHoroscope,
    modifier: Modifier = Modifier,
) {
    val sign = ZodiacSign.fromKey(horoscope.sign)
    val signName = sign.localizedName(horoscope.language)
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        PremiumSectionHeader(
            eyebrow = TimeUtils.displayDate(horoscope.language),
            title = stringResource(R.string.daily_title),
        )
        PremiumHeroCard(
            symbol = sign.symbol,
            eyebrow = signName,
            title = horoscope.short,
            subtitle = sign.localizedDateRange(horoscope.language),
        )
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
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    DailyScoreRow(
                        label = stringResource(R.string.compatibility_love_score),
                        value = horoscope.loveScore,
                        language = horoscope.language,
                        accent = MaterialTheme.colorScheme.secondary,
                    )
                    DailyScoreRow(
                        label = stringResource(R.string.compatibility_work_score),
                        value = horoscope.careerScore,
                        language = horoscope.language,
                        accent = MaterialTheme.colorScheme.tertiary,
                    )
                    DailyScoreRow(
                        label = stringResource(R.string.home_money_label),
                        value = horoscope.moneyScore,
                        language = horoscope.language,
                        accent = MaterialTheme.colorScheme.primary,
                    )
                    DailyScoreRow(
                        label = stringResource(R.string.home_health_label),
                        value = horoscope.healthScore,
                        language = horoscope.language,
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
    }
}

@Composable
private fun DailyScoreRow(
    label: String,
    value: Int,
    language: String,
    accent: androidx.compose.ui.graphics.Color,
) {
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = label.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = TimeUtils.formatPercentage(value, language),
                style = MaterialTheme.typography.labelLarge,
            )
        }
        Box(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(999.dp)),
        ) {
            Box(
                modifier =
                    Modifier
                        .fillMaxWidth(value.coerceIn(0, SCORE_MAX) / SCORE_MAX.toFloat())
                        .height(6.dp)
                        .background(accent, RoundedCornerShape(999.dp)),
            )
        }
    }
}
