@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.chart

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.domain.model.Mahadasha
import com.parsfilo.astrology.core.domain.model.SiderealPosition
import com.parsfilo.astrology.core.domain.model.VedicChart
import com.parsfilo.astrology.core.ui.components.AstrologyCard
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.ui.components.ErrorState
import com.parsfilo.astrology.core.ui.components.LoadingState
import com.parsfilo.astrology.core.ui.components.PremiumHeroCard
import com.parsfilo.astrology.core.ui.components.PremiumPill
import com.parsfilo.astrology.core.ui.components.PremiumSectionHeader
import com.parsfilo.astrology.core.util.TimeUtils
import com.parsfilo.astrology.core.util.ZodiacSign
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun VedicChartScreen(
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: VedicChartViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val configuration = LocalConfiguration.current
    val locale = localeFor(TimeUtils.normalizeLanguageTag(configuration.locales[0].language))
    val dateFormatter = remember(locale) { DateTimeFormatter.ofPattern("MMM yyyy", locale) }

    CosmicBackground(modifier = modifier.fillMaxSize()) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            TextButton(onClick = onNavigateBack) {
                Text(stringResource(R.string.chart_back))
            }
            PremiumSectionHeader(
                title = stringResource(R.string.chart_vedic_title),
                supportingText = stringResource(R.string.chart_vedic_intro),
            )
            when {
                uiState.isLoading -> LoadingState()
                uiState.error != null ->
                    ErrorState(
                        message = uiState.error.orEmpty(),
                        onRetry = { viewModel.onEvent(VedicChartUiEvent.Retry) },
                    )
                uiState.chart != null ->
                    VedicChartContent(
                        chart = uiState.chart!!,
                        language = uiState.language,
                        dateFormatter = dateFormatter,
                    )
            }
        }
    }
}

private fun localeFor(language: String): Locale =
    when (language) {
        "tr" -> Locale.forLanguageTag("tr-TR")
        "es" -> Locale.forLanguageTag("es-ES")
        "pt" -> Locale.forLanguageTag("pt-BR")
        "de" -> Locale.forLanguageTag("de-DE")
        "fr" -> Locale.forLanguageTag("fr-FR")
        else -> Locale.ENGLISH
    }

@Composable
private fun VedicChartContent(
    chart: VedicChart,
    language: String,
    dateFormatter: DateTimeFormatter,
) {
    val moonSign = ZodiacSign.fromKeyOrNull(moonSignKey(chart))
    PremiumHeroCard(
        symbol = "☽",
        eyebrow = stringResource(R.string.chart_vedic_moon_nakshatra_title),
        title = nakshatraDisplayName(chart.moonNakshatra.nakshatra),
        subtitle = stringResource(R.string.chart_vedic_pada_label, chart.moonNakshatra.pada) +
            (moonSign?.let { " · ${it.localizedName(language)}" } ?: ""),
    )
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        PremiumPill(
            text = stringResource(
                R.string.chart_vedic_ayanamsa_label,
            ) + " " + "%.2f°".format(locale = Locale.US, chart.ayanamsa),
        )
    }
    if (chart.limitations.isNotEmpty()) {
        AstrologyCard {
            Text(
                text = stringResource(R.string.chart_vedic_limitations_note),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
    Text(
        text = stringResource(R.string.chart_vedic_positions_title),
        style = MaterialTheme.typography.headlineMedium,
        fontWeight = FontWeight.Bold,
    )
    AstrologyCard {
        chart.positions.forEach { position -> SiderealPositionRow(position, language) }
    }
    Text(
        text = stringResource(R.string.chart_vedic_mahadasha_title),
        style = MaterialTheme.typography.headlineMedium,
        fontWeight = FontWeight.Bold,
    )
    AstrologyCard {
        val now = Instant.now()
        chart.mahadashas.forEach { mahadasha ->
            MahadashaRow(mahadasha, now, dateFormatter)
        }
    }
}

private fun moonSignKey(chart: VedicChart): String? =
    chart.positions.firstOrNull { it.body == "moon" }?.signKey

@Composable
private fun SiderealPositionRow(
    position: SiderealPosition,
    language: String,
) {
    val sign = ZodiacSign.fromKeyOrNull(position.signKey)
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = grahaDisplayName(position.body),
            style = MaterialTheme.typography.bodyLarge,
        )
        Text(
            text = "${sign?.symbol.orEmpty()} ${sign?.localizedName(language).orEmpty()} " +
                "%.1f°".format(locale = Locale.US, position.degreeInSign),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun MahadashaRow(
    mahadasha: Mahadasha,
    now: Instant,
    dateFormatter: DateTimeFormatter,
) {
    val isCurrent = isCurrentMahadasha(mahadasha, now)
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = grahaDisplayName(mahadasha.graha),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Normal,
            color =
                if (isCurrent) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
        )
        Text(
            text =
                formatMahadashaRange(mahadasha, dateFormatter) +
                    if (isCurrent) " · ${stringResource(R.string.chart_vedic_mahadasha_current_label)}" else "",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun isCurrentMahadasha(
    mahadasha: Mahadasha,
    now: Instant,
): Boolean =
    try {
        val start = Instant.parse(mahadasha.startDate)
        val end = Instant.parse(mahadasha.endDate)
        !now.isBefore(start) && now.isBefore(end)
    } catch (exception: java.time.format.DateTimeParseException) {
        false
    }

private fun formatMahadashaRange(
    mahadasha: Mahadasha,
    formatter: DateTimeFormatter,
): String =
    try {
        val start = Instant.parse(mahadasha.startDate).atZone(ZoneOffset.UTC).format(formatter)
        val end = Instant.parse(mahadasha.endDate).atZone(ZoneOffset.UTC).format(formatter)
        "$start – $end"
    } catch (exception: java.time.format.DateTimeParseException) {
        ""
    }

private fun nakshatraDisplayName(nakshatraKey: String): String =
    nakshatraKey
        .split('_')
        .joinToString(" ") { word -> word.replaceFirstChar { it.uppercase() } }

@Composable
private fun grahaDisplayName(grahaKey: String): String =
    stringResource(
        when (grahaKey) {
            "sun" -> R.string.graha_sun
            "moon" -> R.string.graha_moon
            "mercury" -> R.string.graha_mercury
            "venus" -> R.string.graha_venus
            "mars" -> R.string.graha_mars
            "jupiter" -> R.string.graha_jupiter
            "saturn" -> R.string.graha_saturn
            "uranus" -> R.string.graha_uranus
            "neptune" -> R.string.graha_neptune
            "pluto" -> R.string.graha_pluto
            "rahu" -> R.string.graha_rahu
            "ketu" -> R.string.graha_ketu
            else -> R.string.graha_sun
        },
    )
