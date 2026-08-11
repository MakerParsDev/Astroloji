package com.parsfilo.astrology.feature.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.remote.CityResponse
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.BirthDataRepository
import com.parsfilo.astrology.core.data.repository.ChartRepository
import com.parsfilo.astrology.core.data.repository.SessionRepository
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.StringsProvider
import com.parsfilo.astrology.core.util.TimeUtils
import com.parsfilo.astrology.core.util.ZodiacSign
import com.parsfilo.astrology.feature.chart.datePickerMillisToLocalDate
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale
import javax.inject.Inject

enum class OnboardingStep(
    val analyticsValue: String,
) {
    INTRO("intro"),
    BIRTH_PROFILE("birth_profile"),
    NOTIFICATION_VALUE("notification_value"),
    ;

    companion object {
        fun fromPage(page: Int): OnboardingStep =
            when (page) {
                0 -> INTRO
                1 -> BIRTH_PROFILE
                else -> NOTIFICATION_VALUE
            }
    }
}

data class CitySuggestion(
    val id: String,
    val name: String,
    val country: String,
    val latitude: Double,
    val longitude: Double,
    val tzid: String,
)

private fun CityResponse.toSuggestion() =
    CitySuggestion(
        id = id,
        name = name,
        country = country,
        latitude = latitude,
        longitude = longitude,
        tzid = tzid,
    )

data class ChartRevealUiState(
    val ascendantSign: ZodiacSign,
    val ascendantDegree: Double,
)

data class OnboardingUiState(
    val selectedSign: ZodiacSign? = null,
    val birthDateMillis: Long? = null,
    val manualSelectionEnabled: Boolean = false,
    val language: String = TimeUtils.defaultLanguageTag(),
    val notificationHour: Int = 9,
    val isSubmitting: Boolean = false,
    val error: String? = null,
    val cityQuery: String = "",
    val citySuggestions: List<CitySuggestion> = emptyList(),
    val isSearchingCities: Boolean = false,
    val selectedCity: CitySuggestion? = null,
    val birthTimeKnown: Boolean = true,
    val birthHour: Int = 12,
    val birthMinute: Int = 0,
    val chartReveal: ChartRevealUiState? = null,
)

@HiltViewModel
@Suppress("LongParameterList", "TooManyFunctions")
class OnboardingViewModel
    @Inject
    constructor(
        private val preferencesRepository: UserPreferencesRepository,
        private val sessionRepository: SessionRepository,
        private val birthDataRepository: BirthDataRepository,
        private val chartRepository: ChartRepository,
        private val stringsProvider: StringsProvider,
        private val analyticsRepository: AnalyticsRepository,
    ) : ViewModel() {
        private val _uiState = MutableStateFlow(OnboardingUiState())
        val uiState: StateFlow<OnboardingUiState> = _uiState.asStateFlow()
        private var citySearchJob: Job? = null

        init {
            viewModelScope.launch {
                analyticsRepository.track(AnalyticsEvents.ONBOARDING_STARTED)
            }
        }

        fun trackStep(step: OnboardingStep) {
            viewModelScope.launch {
                analyticsRepository.track(
                    AnalyticsEvents.ONBOARDING_STEP_VIEWED,
                    mapOf("step" to step.analyticsValue),
                )
            }
        }

        fun recordNotificationPermission(granted: Boolean) {
            viewModelScope.launch {
                analyticsRepository.track(
                    AnalyticsEvents.NOTIFICATION_PERMISSION_RESULT,
                    mapOf("result" to if (granted) "granted" else "denied"),
                )
            }
        }

        fun recordNotificationPermissionNotRequested() {
            viewModelScope.launch {
                analyticsRepository.track(
                    AnalyticsEvents.NOTIFICATION_PERMISSION_RESULT,
                    mapOf("result" to "not_requested"),
                )
            }
        }

        fun selectSign(sign: ZodiacSign) {
            _uiState.update { it.copy(selectedSign = sign, error = null) }
        }

        fun selectBirthDate(millis: Long) {
            _uiState.update {
                it.copy(
                    birthDateMillis = millis,
                    selectedSign = ZodiacSign.fromBirthDateMillis(millis),
                    error = null,
                )
            }
        }

        fun setManualSelectionEnabled(enabled: Boolean) {
            _uiState.update { current ->
                current.copy(
                    manualSelectionEnabled = enabled,
                    error = null,
                )
            }
        }

        fun setLanguage(language: String) {
            _uiState.update { it.copy(language = language) }
            viewModelScope.launch {
                preferencesRepository.updateLanguage(language)
            }
        }

        fun setNotificationHour(hour: Int) {
            _uiState.update { it.copy(notificationHour = hour.coerceIn(0, 23)) }
        }

        fun updateCityQuery(query: String) {
            _uiState.update { it.copy(cityQuery = query, selectedCity = null, chartReveal = null) }
            citySearchJob?.cancel()
            if (query.trim().length < MIN_CITY_QUERY_LENGTH) {
                _uiState.update { it.copy(citySuggestions = emptyList(), isSearchingCities = false) }
                return
            }
            citySearchJob =
                viewModelScope.launch {
                    delay(CITY_SEARCH_DEBOUNCE_MS)
                    _uiState.update { it.copy(isSearchingCities = true) }
                    when (val result = birthDataRepository.searchCities(query.trim())) {
                        is AppResult.Success -> {
                            _uiState.update {
                                it.copy(
                                    citySuggestions = result.data.map { city -> city.toSuggestion() },
                                    isSearchingCities = false,
                                )
                            }
                        }
                        is AppResult.Error -> _uiState.update { it.copy(isSearchingCities = false) }
                        AppResult.Loading -> Unit
                    }
                }
        }

        fun selectCity(city: CitySuggestion) {
            citySearchJob?.cancel()
            _uiState.update {
                it.copy(
                    selectedCity = city,
                    cityQuery = city.name,
                    citySuggestions = emptyList(),
                    isSearchingCities = false,
                )
            }
        }

        fun clearSelectedCity() {
            _uiState.update {
                it.copy(selectedCity = null, cityQuery = "", citySuggestions = emptyList(), chartReveal = null)
            }
        }

        fun setBirthTimeKnown(known: Boolean) {
            _uiState.update { it.copy(birthTimeKnown = known, chartReveal = null) }
        }

        fun setBirthTime(
            hour: Int,
            minute: Int,
        ) {
            _uiState.update {
                it.copy(
                    birthHour = hour.coerceIn(MIN_HOUR, MAX_HOUR),
                    birthMinute = minute.coerceIn(MIN_MINUTE, MAX_MINUTE),
                )
            }
        }

        fun retryLastSubmission(onSuccess: () -> Unit) {
            if (_uiState.value.isSubmitting) return
            complete(onSuccess)
        }

        fun complete(onSuccess: () -> Unit) {
            val sign =
                _uiState.value.selectedSign ?: run {
                    _uiState.update { it.copy(error = stringsProvider.get(R.string.onboarding_error_missing_sign)) }
                    return
                }

            viewModelScope.launch {
                _uiState.update { it.copy(isSubmitting = true, error = null) }
                preferencesRepository.updateOnboarding(
                    completed = false,
                    sign = sign.key,
                    language = _uiState.value.language,
                )
                preferencesRepository.updateNotification(enabled = true, hour = _uiState.value.notificationHour)
                preferencesRepository.updateSession(
                    userId = preferencesRepository.current().userId ?: "",
                    jwt = preferencesRepository.current().jwt.orEmpty(),
                    isPremium = preferencesRepository.current().isPremium,
                    premiumExpiresAt = preferencesRepository.current().premiumExpiresAt,
                    sign = sign.key,
                    language = _uiState.value.language,
                    utcOffset = TimeUtils.utcOffsetHours(),
                    notificationEnabled = true,
                    notificationHour = _uiState.value.notificationHour,
                )

                when (val result = sessionRepository.registerFromPreferences()) {
                    is AppResult.Success -> {
                        preferencesRepository.updateOnboarding(true, sign.key, _uiState.value.language)
                        analyticsRepository.enqueue(
                            AnalyticsEvents.ONBOARDING_COMPLETED,
                            mapOf("sign" to sign.key, "locale" to _uiState.value.language),
                        )
                        saveBirthDataAndReveal()
                        _uiState.update { it.copy(isSubmitting = false) }
                        // When a real Ascendant was revealed, the screen shows it and its own
                        // "Continue" button calls onSuccess — don't navigate away underneath it.
                        if (_uiState.value.chartReveal == null) {
                            onSuccess()
                        }
                    }
                    is AppResult.Error -> {
                        _uiState.update {
                            it.copy(
                                isSubmitting = false,
                                error =
                                    result.exception.message
                                        ?: stringsProvider.get(R.string.session_error_open_failed_after_register),
                            )
                        }
                    }
                    AppResult.Loading -> Unit
                }
            }
        }

        /**
         * Optional enhancement layered on top of registration: saves the chosen birth
         * city/date/time (if any) so future sessions can generate personalized content and a
         * real Ascendant. Deliberately best-effort — sign-based onboarding already succeeded by
         * the time this runs, so a failure here (network blip, unreachable city, etc.) must
         * never block or roll back onboarding completion; the user can add birth data later.
         */
        private suspend fun saveBirthDataAndReveal() {
            val state = _uiState.value
            val city = state.selectedCity ?: return
            val birthDateMillis = state.birthDateMillis ?: return
            val localDate = datePickerMillisToLocalDate(birthDateMillis)

            val saved = persistBirthData(state, city, localDate)
            if (saved && state.birthTimeKnown) {
                revealAscendant(state, city, localDate)
            }
        }

        private suspend fun persistBirthData(
            state: OnboardingUiState,
            city: CitySuggestion,
            localDate: LocalDate,
        ): Boolean {
            val timeCertainty = if (state.birthTimeKnown) "exact" else "unknown"
            val localTime =
                if (state.birthTimeKnown) {
                    String.format(Locale.ROOT, "%02d:%02d:00", state.birthHour, state.birthMinute)
                } else {
                    null
                }
            val saveResult =
                birthDataRepository.saveBirthData(
                    localDate = localDate.toString(),
                    localTime = localTime,
                    timeCertainty = timeCertainty,
                    cityId = city.id,
                )
            return saveResult is AppResult.Success
        }

        private suspend fun revealAscendant(
            state: OnboardingUiState,
            city: CitySuggestion,
            localDate: LocalDate,
        ) {
            val utcInstant =
                localDate
                    .atTime(state.birthHour, state.birthMinute)
                    .atZone(ZoneId.of(city.tzid))
                    .toInstant()
            val chartResult =
                chartRepository.getNatalChart(
                    timestamp = utcInstant.toString(),
                    timeCertainty = "exact",
                    latitude = city.latitude,
                    longitude = city.longitude,
                )
            val ascendant = (chartResult as? AppResult.Success)?.data?.ascendant ?: return
            val sign = ZodiacSign.fromKeyOrNull(ascendant.zodiac.sign) ?: return
            _uiState.update {
                it.copy(
                    chartReveal = ChartRevealUiState(ascendantSign = sign, ascendantDegree = ascendant.zodiac.degree),
                )
            }
        }

        private companion object {
            const val MIN_HOUR = 0
            const val MAX_HOUR = 23
            const val MIN_MINUTE = 0
            const val MAX_MINUTE = 59
            const val MIN_CITY_QUERY_LENGTH = 2
            const val CITY_SEARCH_DEBOUNCE_MS = 300L
        }
    }
