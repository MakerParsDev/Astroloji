@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.compatibility

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.domain.model.CompatibilityReport
import com.parsfilo.astrology.core.ui.components.PremiumGlassCard
import com.parsfilo.astrology.core.ui.components.PremiumMetricRing
import com.parsfilo.astrology.core.ui.components.PremiumPill
import com.parsfilo.astrology.core.util.ZodiacSign

@Suppress("LongMethod")
@Composable
internal fun CompatibilityPremiumSummary(
    mySign: ZodiacSign,
    selectedSign: ZodiacSign,
    report: CompatibilityReport,
    language: String,
    modifier: Modifier = Modifier,
) {
    PremiumGlassCard(modifier = modifier) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PremiumCompatibilitySign(
                sign = mySign,
                language = language,
                active = true,
            )
            PremiumMetricRing(
                value = report.overallScore,
                label = stringResource(R.string.compatibility_label),
                accent = MaterialTheme.colorScheme.secondary,
            )
            PremiumCompatibilitySign(
                sign = selectedSign,
                language = language,
                active = false,
            )
        }
        Text(
            text = report.summary,
            modifier = Modifier.fillMaxWidth(),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            PremiumPill(
                text =
                    "${stringResource(R.string.compatibility_love_score)} · " +
                        compatibilityScoreLabel(report.loveScore, language, "—"),
            )
            PremiumPill(
                text =
                    "${stringResource(R.string.compatibility_friendship_score)} · " +
                        compatibilityScoreLabel(report.friendshipScore, language, "—"),
            )
            PremiumPill(
                text =
                    "${stringResource(R.string.compatibility_work_score)} · " +
                        compatibilityScoreLabel(report.workScore, language, "—"),
            )
        }
    }
}

@Composable
private fun PremiumCompatibilitySign(
    sign: ZodiacSign,
    language: String,
    active: Boolean,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Surface(
            modifier = Modifier.size(74.dp),
            shape = CircleShape,
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f),
            border =
                BorderStroke(
                    1.dp,
                    if (active) {
                        MaterialTheme.colorScheme.primary.copy(alpha = 0.62f)
                    } else {
                        MaterialTheme.colorScheme.secondary.copy(alpha = 0.52f)
                    },
                ),
        ) {
            Box(
                modifier =
                    Modifier.background(
                        sign.element.color.copy(alpha = if (active) 0.22f else 0.1f),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = sign.symbol,
                    style = MaterialTheme.typography.headlineMedium,
                )
            }
        }
        Text(
            text = sign.localizedName(language),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
        )
    }
}
