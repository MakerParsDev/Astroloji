@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.daily

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.ui.components.AstrologyCard

@Composable
internal fun DailyFeedbackCard(
    feedback: DailyFeedback?,
    onFeedback: (DailyFeedback) -> Unit,
) {
    AstrologyCard {
        Text(
            text = stringResource(R.string.daily_feedback_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        if (feedback == null) {
            Text(
                text = stringResource(R.string.daily_feedback_body),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FeedbackButton(
                    label = stringResource(R.string.daily_feedback_resonated),
                    feedback = DailyFeedback.RESONATED,
                    onFeedback = onFeedback,
                )
                FeedbackButton(
                    label = stringResource(R.string.daily_feedback_partly),
                    feedback = DailyFeedback.PARTLY,
                    onFeedback = onFeedback,
                )
                FeedbackButton(
                    label = stringResource(R.string.daily_feedback_not_today),
                    feedback = DailyFeedback.NOT_TODAY,
                    onFeedback = onFeedback,
                )
            }
        } else {
            Text(
                text = stringResource(R.string.daily_feedback_thanks),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.secondary,
            )
        }
    }
}

@Composable
private fun FeedbackButton(
    label: String,
    feedback: DailyFeedback,
    onFeedback: (DailyFeedback) -> Unit,
) {
    OutlinedButton(onClick = { onFeedback(feedback) }) {
        Text(label)
    }
}
