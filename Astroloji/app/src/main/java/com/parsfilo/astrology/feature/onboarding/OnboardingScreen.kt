@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.onboarding

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.ui.components.AstrologyCard
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.ui.components.ErrorState
import com.parsfilo.astrology.core.ui.components.LoadingState
import com.parsfilo.astrology.core.ui.components.ZodiacChip
import com.parsfilo.astrology.core.util.AppLanguageManager
import com.parsfilo.astrology.core.util.ZodiacSign
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun OnboardingScreen(
    onComplete: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: OnboardingViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val pagerState = rememberPagerState(pageCount = { 3 })
    val coroutineScope = rememberCoroutineScope()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    val missingSignMessage = stringResource(R.string.onboarding_error_missing_sign)

    LaunchedEffect(pagerState.currentPage) {
        viewModel.trackStep(OnboardingStep.fromPage(pagerState.currentPage))
    }
    val permissionLauncher =
        rememberLauncherForActivityResult(
            contract = ActivityResultContracts.RequestPermission(),
        ) { granted ->
            viewModel.recordNotificationPermission(granted)
            viewModel.complete(onComplete)
        }

    if (uiState.isSubmitting) {
        LoadingState()
        return
    }

    uiState.chartReveal?.let { reveal ->
        ChartRevealScreen(
            reveal = reveal,
            language = uiState.language,
            onContinue = onComplete,
        )
        return
    }

    Column(
        modifier = modifier.fillMaxSize(),
    ) {
        CosmicBackground(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .padding(horizontal = 20.dp, vertical = 24.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                HorizontalPager(
                    state = pagerState,
                    modifier = Modifier.weight(1f),
                    userScrollEnabled = pagerState.currentPage != 1 || uiState.selectedSign != null,
                ) { page ->
                    when (page) {
                        0 -> OnboardingIntroPage()
                        1 ->
                            OnboardingSignPage(
                                birthDateMillis = uiState.birthDateMillis,
                                selected = uiState.selectedSign,
                                manualSelectionEnabled = uiState.manualSelectionEnabled,
                                language = uiState.language,
                                cityQuery = uiState.cityQuery,
                                citySuggestions = uiState.citySuggestions,
                                isSearchingCities = uiState.isSearchingCities,
                                selectedCity = uiState.selectedCity,
                                birthTimeKnown = uiState.birthTimeKnown,
                                birthHour = uiState.birthHour,
                                birthMinute = uiState.birthMinute,
                                onBirthDateSelected = viewModel::selectBirthDate,
                                onManualSelectionChange = viewModel::setManualSelectionEnabled,
                                onLanguageChange = {
                                    AppLanguageManager.applyLanguage(context, it)
                                    viewModel.setLanguage(it)
                                },
                                onSelectSign = viewModel::selectSign,
                                onCityQueryChange = viewModel::updateCityQuery,
                                onCitySelected = viewModel::selectCity,
                                onClearCity = viewModel::clearSelectedCity,
                                onBirthTimeKnownChange = viewModel::setBirthTimeKnown,
                                onBirthTimeChange = viewModel::setBirthTime,
                            )
                        else ->
                            OnboardingNotificationPage(
                                notificationHour = uiState.notificationHour,
                                onNotificationHourChange = viewModel::setNotificationHour,
                            )
                    }
                }

                uiState.error?.let {
                    ErrorState(
                        message = it,
                        onRetry = { viewModel.retryLastSubmission(onComplete) },
                    )
                }

                Button(
                    onClick = {
                        if (pagerState.currentPage == 1 && uiState.selectedSign == null) {
                            coroutineScope.launch {
                                snackbarHostState.showSnackbar(
                                    message = missingSignMessage,
                                )
                            }
                            return@Button
                        }
                        when {
                            pagerState.currentPage < 2 -> {
                                coroutineScope.launch {
                                    pagerState.animateScrollToPage(pagerState.currentPage + 1)
                                }
                            }
                            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> {
                                permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                            }
                            else -> {
                                viewModel.recordNotificationPermissionNotRequested()
                                viewModel.complete(onComplete)
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors =
                        ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primary,
                            contentColor = MaterialTheme.colorScheme.onPrimary,
                        ),
                ) {
                    Text(
                        text =
                            if (pagerState.currentPage == 2) {
                                stringResource(R.string.onboarding_start)
                            } else {
                                stringResource(R.string.onboarding_continue)
                            },
                    )
                }
                SnackbarHost(hostState = snackbarHostState)
            }
        }
    }
}

@Composable
private fun OnboardingIntroPage() {
    AstrologyCard(
        modifier =
            Modifier
                .fillMaxSize()
                .padding(top = 14.dp),
    ) {
        Box(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(200.dp)
                    .background(
                        Brush.linearGradient(
                            listOf(
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.24f),
                                MaterialTheme.colorScheme.tertiary.copy(alpha = 0.12f),
                            ),
                        ),
                        shape =
                            androidx.compose.foundation.shape
                                .RoundedCornerShape(24.dp),
                    ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "✦",
                style = MaterialTheme.typography.displayLarge.copy(fontWeight = FontWeight.Black),
                color = MaterialTheme.colorScheme.secondary,
            )
        }
        Text(text = stringResource(R.string.onboarding_intro_title), style = MaterialTheme.typography.displayLarge)
        Text(
            text = stringResource(R.string.onboarding_intro_body),
            style = MaterialTheme.typography.bodyLarge,
        )
        Spacer(Modifier.height(4.dp))
        Text(text = stringResource(R.string.onboarding_intro_feature_content), style = MaterialTheme.typography.titleMedium)
        Text(text = stringResource(R.string.onboarding_intro_feature_premium), style = MaterialTheme.typography.titleMedium)
    }
}

@Suppress("LongParameterList")
@Composable
private fun OnboardingSignPage(
    birthDateMillis: Long?,
    selected: ZodiacSign?,
    manualSelectionEnabled: Boolean,
    language: String,
    cityQuery: String,
    citySuggestions: List<CitySuggestion>,
    isSearchingCities: Boolean,
    selectedCity: CitySuggestion?,
    birthTimeKnown: Boolean,
    birthHour: Int,
    birthMinute: Int,
    onBirthDateSelected: (Long) -> Unit,
    onManualSelectionChange: (Boolean) -> Unit,
    onLanguageChange: (String) -> Unit,
    onSelectSign: (ZodiacSign) -> Unit,
    onCityQueryChange: (String) -> Unit,
    onCitySelected: (CitySuggestion) -> Unit,
    onClearCity: () -> Unit,
    onBirthTimeKnownChange: (Boolean) -> Unit,
    onBirthTimeChange: (Int, Int) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(text = stringResource(R.string.onboarding_sign_title), style = MaterialTheme.typography.displayLarge)
        Text(
            text = stringResource(R.string.onboarding_sign_body),
            style = MaterialTheme.typography.bodyLarge,
        )
        OnboardingLanguageSelector(language = language, onLanguageChange = onLanguageChange)
        BirthDateCard(
            birthDateMillis = birthDateMillis,
            language = language,
            onBirthDateSelected = onBirthDateSelected,
        )
        BirthLocationSection(
            cityQuery = cityQuery,
            citySuggestions = citySuggestions,
            isSearchingCities = isSearchingCities,
            selectedCity = selectedCity,
            birthTimeKnown = birthTimeKnown,
            birthHour = birthHour,
            birthMinute = birthMinute,
            onCityQueryChange = onCityQueryChange,
            onCitySelected = onCitySelected,
            onClearCity = onClearCity,
            onBirthTimeKnownChange = onBirthTimeKnownChange,
            onBirthTimeChange = onBirthTimeChange,
        )
        selected?.let { sign ->
            DetectedSignCard(
                sign = sign,
                language = language,
                manualSelectionEnabled = manualSelectionEnabled,
                onManualSelectionChange = onManualSelectionChange,
            )
        }
        if (manualSelectionEnabled) {
            ManualSignGrid(selected = selected, language = language, onSelectSign = onSelectSign)
        }
    }
}

@Composable
private fun OnboardingLanguageSelector(
    language: String,
    onLanguageChange: (String) -> Unit,
) {
    val languageCodes = listOf("tr", "en", "es", "pt", "de", "fr")
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        languageCodes.forEach { code ->
            FilterChip(
                selected = language == code,
                onClick = { onLanguageChange(code) },
                label = {
                    Text(
                        text =
                            when (code) {
                                "tr" -> stringResource(R.string.language_name_turkish)
                                "es" -> stringResource(R.string.language_name_spanish)
                                "pt" -> stringResource(R.string.language_name_portuguese)
                                "de" -> stringResource(R.string.language_name_german)
                                "fr" -> stringResource(R.string.language_name_french)
                                else -> stringResource(R.string.language_name_english)
                            },
                    )
                },
            )
        }
    }
}

private fun notInTheFutureSelectableDates(currentYear: Int): SelectableDates =
    object : SelectableDates {
        override fun isSelectableDate(utcTimeMillis: Long): Boolean = utcTimeMillis <= System.currentTimeMillis()

        override fun isSelectableYear(year: Int): Boolean = year <= currentYear
    }

private fun localeForLanguage(language: String): Locale =
    when (language) {
        "tr" -> Locale.forLanguageTag("tr")
        "es" -> Locale.forLanguageTag("es")
        "pt" -> Locale.forLanguageTag("pt-BR")
        "de" -> Locale.forLanguageTag("de-DE")
        "fr" -> Locale.forLanguageTag("fr-FR")
        else -> Locale.ENGLISH
    }

@Composable
private fun BirthDateCard(
    birthDateMillis: Long?,
    language: String,
    onBirthDateSelected: (Long) -> Unit,
) {
    var showDatePicker by remember { mutableStateOf(false) }
    val currentYear = remember { LocalDate.now().year }
    val datePickerState =
        rememberDatePickerState(
            initialSelectedDateMillis = birthDateMillis,
            yearRange = DatePickerDefaults.YearRange.first..currentYear,
            selectableDates = remember { notInTheFutureSelectableDates(currentYear) },
        )
    val locale = localeForLanguage(language)
    val dateFormatter = remember(locale) { DateTimeFormatter.ofPattern("d MMMM yyyy", locale) }
    val selectedDateLabel =
        birthDateMillis?.let {
            Instant
                .ofEpochMilli(it)
                .atZone(ZoneId.systemDefault())
                .toLocalDate()
                .format(dateFormatter)
        }

    if (showDatePicker) {
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        datePickerState.selectedDateMillis?.let(onBirthDateSelected)
                        showDatePicker = false
                    },
                ) {
                    Text(stringResource(R.string.onboarding_confirm_date))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) {
                    Text(stringResource(R.string.onboarding_cancel))
                }
            },
        ) {
            DatePicker(state = datePickerState)
        }
    }

    AstrologyCard {
        Text(
            text = stringResource(R.string.onboarding_birthdate_label),
            style = MaterialTheme.typography.titleMedium,
        )
        Text(
            text = selectedDateLabel ?: stringResource(R.string.onboarding_birthdate_placeholder),
            style = MaterialTheme.typography.bodyLarge,
        )
        Button(onClick = { showDatePicker = true }) {
            Text(stringResource(R.string.onboarding_birthdate_action))
        }
    }
}

@Composable
private fun DetectedSignCard(
    sign: ZodiacSign,
    language: String,
    manualSelectionEnabled: Boolean,
    onManualSelectionChange: (Boolean) -> Unit,
) {
    AstrologyCard {
        Text(
            text = stringResource(R.string.onboarding_detected_sign_label),
            style = MaterialTheme.typography.titleMedium,
        )
        Text(
            text =
                stringResource(
                    R.string.onboarding_detected_sign_value,
                    sign.localizedName(language),
                    sign.symbol,
                ),
            style = MaterialTheme.typography.bodyLarge,
        )
        Text(
            text = sign.localizedDateRange(language),
            style = MaterialTheme.typography.bodyMedium,
        )
        TextButton(onClick = { onManualSelectionChange(!manualSelectionEnabled) }) {
            Text(
                if (manualSelectionEnabled) {
                    stringResource(R.string.onboarding_hide_manual_selection)
                } else {
                    stringResource(R.string.onboarding_show_manual_selection)
                },
            )
        }
    }
}

@Composable
private fun ManualSignGrid(
    selected: ZodiacSign?,
    language: String,
    onSelectSign: (ZodiacSign) -> Unit,
) {
    Text(
        text = stringResource(R.string.onboarding_manual_selection_title),
        style = MaterialTheme.typography.titleMedium,
    )
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 152.dp),
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(2.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(ZodiacSign.entries) { sign ->
            ZodiacChip(
                sign = sign,
                language = language,
                selected = selected == sign,
                modifier = Modifier.widthIn(min = 152.dp),
                onClick = { onSelectSign(sign) },
            )
        }
    }
}

@Composable
private fun OnboardingNotificationPage(
    notificationHour: Int,
    onNotificationHourChange: (Int) -> Unit,
) {
    val timePickerState =
        rememberTimePickerState(
            initialHour = notificationHour,
            initialMinute = 0,
            is24Hour = true,
        )
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(text = stringResource(R.string.onboarding_notifications_title), style = MaterialTheme.typography.displayLarge)
        Text(
            text = stringResource(R.string.onboarding_notifications_body),
            style = MaterialTheme.typography.bodyLarge,
        )
        TimePicker(
            state = timePickerState,
            modifier = Modifier.fillMaxWidth(),
        )
        Button(onClick = { onNotificationHourChange(timePickerState.hour) }) {
            Text(stringResource(R.string.onboarding_save_hour))
        }
    }
}
