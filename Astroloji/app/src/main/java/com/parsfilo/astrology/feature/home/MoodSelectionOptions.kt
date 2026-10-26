@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.parsfilo.astrology.R

private val MOOD_OPTIONS = listOf("great", "good", "neutral", "low", "stressed")

@Composable
internal fun MoodSelectionOptions(onLogMood: (String) -> Unit) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        MOOD_OPTIONS.forEach { mood ->
            val label = stringResource(moodLabelRes(mood))
            Text(
                text = moodEmoji(mood),
                style = MaterialTheme.typography.headlineSmall,
                modifier =
                    Modifier
                        .testTag("mood-option-$mood")
                        .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
                        .clip(CircleShape)
                        .clickable(
                            role = Role.Button,
                            onClickLabel = label,
                            onClick = { onLogMood(mood) },
                        ).semantics { contentDescription = label }
                        .padding(9.dp),
            )
        }
    }
}

private fun moodLabelRes(mood: String): Int =
    when (mood) {
        "great" -> R.string.home_mood_option_great
        "good" -> R.string.home_mood_option_good
        "neutral" -> R.string.home_mood_option_neutral
        "low" -> R.string.home_mood_option_low
        "stressed" -> R.string.home_mood_option_stressed
        else -> R.string.home_mood_option_neutral
    }
