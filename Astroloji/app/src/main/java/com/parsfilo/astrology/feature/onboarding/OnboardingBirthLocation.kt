@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.onboarding

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.ui.components.AstrologyCard
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.ui.components.PremiumGoldButton
import com.parsfilo.astrology.core.ui.components.PremiumHeroCard
import java.util.Locale

@Suppress("LongParameterList")
@Composable
internal fun BirthLocationSection(
    cityQuery: String,
    citySuggestions: List<CitySuggestion>,
    isSearchingCities: Boolean,
    selectedCity: CitySuggestion?,
    birthTimeKnown: Boolean,
    birthHour: Int,
    birthMinute: Int,
    onCityQueryChange: (String) -> Unit,
    onCitySelected: (CitySuggestion) -> Unit,
    onClearCity: () -> Unit,
    onBirthTimeKnownChange: (Boolean) -> Unit,
    onBirthTimeChange: (Int, Int) -> Unit,
) {
    AstrologyCard {
        Text(
            text = stringResource(R.string.onboarding_birth_location_title),
            style = MaterialTheme.typography.titleMedium,
        )
        Text(
            text = stringResource(R.string.onboarding_birth_location_body),
            style = MaterialTheme.typography.bodyMedium,
        )
        CitySearchField(
            cityQuery = cityQuery,
            citySuggestions = citySuggestions,
            isSearchingCities = isSearchingCities,
            selectedCity = selectedCity,
            onCityQueryChange = onCityQueryChange,
            onCitySelected = onCitySelected,
            onClearCity = onClearCity,
        )
        BirthTimeSection(
            birthTimeKnown = birthTimeKnown,
            birthHour = birthHour,
            birthMinute = birthMinute,
            onBirthTimeKnownChange = onBirthTimeKnownChange,
            onBirthTimeChange = onBirthTimeChange,
        )
    }
}

@Suppress("LongParameterList")
@Composable
private fun CitySearchField(
    cityQuery: String,
    citySuggestions: List<CitySuggestion>,
    isSearchingCities: Boolean,
    selectedCity: CitySuggestion?,
    onCityQueryChange: (String) -> Unit,
    onCitySelected: (CitySuggestion) -> Unit,
    onClearCity: () -> Unit,
) {
    if (selectedCity != null) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "${selectedCity.name}, ${selectedCity.country}",
                style = MaterialTheme.typography.bodyLarge,
            )
            TextButton(onClick = onClearCity) {
                Text(stringResource(R.string.onboarding_city_change))
            }
        }
        return
    }
    OutlinedTextField(
        value = cityQuery,
        onValueChange = onCityQueryChange,
        label = { Text(stringResource(R.string.onboarding_city_search_label)) },
        placeholder = { Text(stringResource(R.string.onboarding_city_search_placeholder)) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
    )
    if (isSearchingCities) {
        Text(
            text = stringResource(R.string.onboarding_city_searching),
            style = MaterialTheme.typography.bodySmall,
        )
    }
    citySuggestions.forEach { suggestion ->
        Text(
            text = "${suggestion.name}, ${suggestion.country}",
            style = MaterialTheme.typography.bodyLarge,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .clickable { onCitySelected(suggestion) }
                    .padding(vertical = 8.dp),
        )
    }
}

@Composable
private fun BirthTimeSection(
    birthTimeKnown: Boolean,
    birthHour: Int,
    birthMinute: Int,
    onBirthTimeKnownChange: (Boolean) -> Unit,
    onBirthTimeChange: (Int, Int) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(R.string.onboarding_birth_time_known_label),
            style = MaterialTheme.typography.bodyLarge,
        )
        Switch(checked = birthTimeKnown, onCheckedChange = onBirthTimeKnownChange)
    }
    if (!birthTimeKnown) {
        Text(
            text = stringResource(R.string.onboarding_birth_time_unknown_note),
            style = MaterialTheme.typography.bodySmall,
        )
        return
    }
    val timePickerState =
        rememberTimePickerState(
            initialHour = birthHour,
            initialMinute = birthMinute,
            is24Hour = true,
        )
    LaunchedEffect(timePickerState.hour, timePickerState.minute) {
        onBirthTimeChange(timePickerState.hour, timePickerState.minute)
    }
    TimePicker(state = timePickerState, modifier = Modifier.fillMaxWidth())
}

@Composable
internal fun ChartRevealScreen(
    reveal: ChartRevealUiState,
    language: String,
    onContinue: () -> Unit,
) {
    CosmicBackground(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(horizontal = 20.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Spacer(Modifier.weight(1f))
            PremiumHeroCard(
                symbol = reveal.ascendantSign.symbol,
                eyebrow = stringResource(R.string.onboarding_reveal_eyebrow),
                title = reveal.ascendantSign.localizedName(language),
                subtitle =
                    stringResource(
                        R.string.onboarding_reveal_subtitle,
                        stringResource(
                            R.string.onboarding_reveal_degree_format,
                            String.format(Locale.ROOT, "%.1f", reveal.ascendantDegree),
                        ),
                    ),
            )
            Spacer(Modifier.weight(1f))
            PremiumGoldButton(
                text = stringResource(R.string.onboarding_reveal_continue),
                onClick = onContinue,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
