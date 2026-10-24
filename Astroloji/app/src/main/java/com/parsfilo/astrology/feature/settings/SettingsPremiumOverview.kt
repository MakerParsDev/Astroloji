@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.settings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.ui.components.PremiumHeroCard
import com.parsfilo.astrology.core.ui.components.PremiumSectionHeader
import com.parsfilo.astrology.core.ui.components.ZodiacIcon
import com.parsfilo.astrology.core.util.ZodiacSign

@Composable
internal fun SettingsPremiumOverview(
    currentSign: ZodiacSign,
    language: String,
    onChangeSign: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        PremiumSectionHeader(
            eyebrow = stringResource(R.string.home_brand),
            title = stringResource(R.string.settings_title),
        )
        PremiumHeroCard(
            symbol = currentSign.symbol,
            eyebrow = currentSign.localizedName(language),
            title = stringResource(R.string.settings_change_sign),
            subtitle = currentSign.localizedDateRange(language),
        )
        FlowRow(
            modifier = Modifier.fillMaxWidth().selectableGroup(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            ZodiacSign.entries.forEach { sign ->
                val selected = sign.key == currentSign.key
                Surface(
                    modifier =
                        Modifier
                            .heightIn(min = 48.dp)
                            .selectable(
                                selected = selected,
                                role = Role.RadioButton,
                                onClick = { onChangeSign(sign.key) },
                            ),
                    shape = RoundedCornerShape(14.dp),
                    color =
                        if (selected) {
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.17f)
                        } else {
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.62f)
                        },
                    contentColor = MaterialTheme.colorScheme.onSurface,
                    border =
                        BorderStroke(
                            1.dp,
                            if (selected) {
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.48f)
                            } else {
                                MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.66f)
                            },
                        ),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        ZodiacIcon(
                            sign = sign,
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.onSurface,
                        )
                        Text(sign.localizedName(language), style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
    }
}
