package com.parsfilo.astrology.feature.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.SessionRepository
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.StringsProvider
import com.parsfilo.astrology.core.util.TimeUtils
import com.parsfilo.astrology.core.util.ZodiacSign
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class OnboardingUiState(
    val selectedSign: ZodiacSign? = null,
    val birthDateMillis: Long? = null,
    val manualSelectionEnabled: Boolean = false,
    val language: String = TimeUtils.defaultLanguageTag(),
    val notificationHour: Int = 9,
    val isSubmitting: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class OnboardingViewModel
    @Inject
    constructor(
        private val preferencesRepository: UserPreferencesRepository,
        private val sessionRepository: SessionRepository,
        private val stringsProvider: StringsProvider,
    ) : ViewModel() {
        private val _uiState = MutableStateFlow(OnboardingUiState())
        val uiState: StateFlow<OnboardingUiState> = _uiState.asStateFlow()

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
                        _uiState.update { it.copy(isSubmitting = false) }
                        onSuccess()
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
    }
