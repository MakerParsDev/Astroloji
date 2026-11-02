@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.core.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.parsfilo.astrology.R

@Composable
fun PremiumUnlockCallout(
    onOpenPremium: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AstrologyCard(modifier = modifier.fillMaxWidth()) {
        Text(
            text = stringResource(R.string.premium_insights_title),
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = stringResource(R.string.premium_insights_description),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Button(onClick = onOpenPremium, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.common_open_premium))
        }
    }
}
