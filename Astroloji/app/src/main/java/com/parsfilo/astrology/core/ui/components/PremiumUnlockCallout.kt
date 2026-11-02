@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.core.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
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

@Composable
fun PremiumLockedLabel() {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.secondary.copy(alpha = 0.16f),
    ) {
        Text(
            text = stringResource(R.string.nav_premium),
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
