package com.parsfilo.astrology.feature.settings

import androidx.lifecycle.viewModelScope
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.remote.UpdateUserRequest
import com.parsfilo.astrology.core.data.repository.BillingManager
import com.parsfilo.astrology.core.data.repository.FavoritesRepository
import com.parsfilo.astrology.core.data.repository.SessionRepository
import com.parsfilo.astrology.core.domain.model.UserProfile
import com.parsfilo.astrology.core.ui.MviViewModel
import com.parsfilo.astrology.core.util.AppResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsUiState(
    val isLoading: Boolean = true,
    val profile: UserProfile? = null,
    val favorites: List<String> = emptyList(),
    val theme: String = "system",
    val language: String = "tr",
    val notificationEnabled: Boolean = true,
    val notificationHour: Int = 9,
    val showDeleteConfirmation: Boolean = false,
    val isDeletingAccount: Boolean = false,
    val error: String? = null,
)

sealed interface SettingsUiEvent {
    data class ChangeTheme(
        val theme: String,
    ) : SettingsUiEvent

    data class ChangeLanguage(
        val language: String,
    ) : SettingsUiEvent

    data class ChangeSign(
        val sign: String,
    ) : SettingsUiEvent

    data class ChangeNotificationEnabled(
        val enabled: Boolean,
    ) : SettingsUiEvent

    data class ChangeNotificationHour(
        val hour: Int,
    ) : SettingsUiEvent

    data class RemoveFavorite(
        val sign: String,
    ) : SettingsUiEvent

    data object RestorePurchase : SettingsUiEvent

    data object RequestAccountDeletion : SettingsUiEvent

    data object DismissAccountDeletion : SettingsUiEvent

    data object ConfirmAccountDeletion : SettingsUiEvent
}

sealed interface SettingsEffect {
    data object AccountDeleted : SettingsEffect
}

@HiltViewModel
class SettingsViewModel
    @Inject
    constructor(
        private val preferencesRepository: UserPreferencesRepository,
        private val sessionRepository: SessionRepository,
        private val favoritesRepository: FavoritesRepository,
        private val billingManager: BillingManager,
    ) : MviViewModel<SettingsUiState, SettingsUiEvent, SettingsEffect>(SettingsUiState()) {
        init {
            viewModelScope.launch {
                val prefs = preferencesRepository.current()
                val profile = (sessionRepository.loadProfile() as? AppResult.Success)?.data
                val favorites = favoritesRepository.getFavorites()
                setState {
                    copy(
                        isLoading = false,
                        profile = profile,
                        favorites = favorites,
                        theme = prefs.theme,
                        language = prefs.language,
                        notificationEnabled = prefs.notificationEnabled,
                        notificationHour = prefs.notificationHour,
                    )
                }
            }
        }

        override fun onEvent(event: SettingsUiEvent) {
            viewModelScope.launch {
                when (event) {
                    is SettingsUiEvent.ChangeTheme -> {
                        preferencesRepository.updateTheme(event.theme)
                        setState { copy(theme = event.theme) }
                    }
                    is SettingsUiEvent.ChangeLanguage -> {
                        preferencesRepository.updateLanguage(event.language)
                        sessionRepository.updateProfile(UpdateUserRequest(language = event.language))
                        setState { copy(language = event.language) }
                    }
                    is SettingsUiEvent.ChangeSign -> {
                        sessionRepository.updateProfile(UpdateUserRequest(sign = event.sign))
                        setState { copy(profile = state.value.profile?.copy(sign = event.sign)) }
                    }
                    is SettingsUiEvent.ChangeNotificationEnabled -> {
                        preferencesRepository.updateNotification(event.enabled, state.value.notificationHour)
                        sessionRepository.updateProfile(
                            UpdateUserRequest(
                                notificationEnabled = event.enabled,
                                notificationHour = state.value.notificationHour,
                            ),
                        )
                        setState { copy(notificationEnabled = event.enabled) }
                    }
                    is SettingsUiEvent.ChangeNotificationHour -> {
                        preferencesRepository.updateNotification(state.value.notificationEnabled, event.hour)
                        sessionRepository.updateProfile(
                            UpdateUserRequest(
                                notificationEnabled = state.value.notificationEnabled,
                                notificationHour = event.hour,
                            ),
                        )
                        setState { copy(notificationHour = event.hour) }
                    }
                    is SettingsUiEvent.RemoveFavorite -> {
                        favoritesRepository.remove(event.sign)
                        val favorites = favoritesRepository.getFavorites()
                        setState { copy(favorites = favorites) }
                    }
                    SettingsUiEvent.RequestAccountDeletion -> {
                        setState { copy(showDeleteConfirmation = true, error = null) }
                    }
                    SettingsUiEvent.DismissAccountDeletion -> {
                        if (!state.value.isDeletingAccount) {
                            setState { copy(showDeleteConfirmation = false, error = null) }
                        }
                    }
                    SettingsUiEvent.ConfirmAccountDeletion -> deleteAccount()
                    SettingsUiEvent.RestorePurchase -> restorePurchase()
                }
            }
        }

        private suspend fun deleteAccount() {
            setState { copy(isDeletingAccount = true, error = null) }
            when (val result = sessionRepository.deleteAccount()) {
                is AppResult.Success -> {
                    setState {
                        copy(
                            isDeletingAccount = false,
                            showDeleteConfirmation = false,
                            error = null,
                        )
                    }
                    sendEffect { SettingsEffect.AccountDeleted }
                }
                is AppResult.Error -> {
                    setState {
                        copy(
                            isDeletingAccount = false,
                            showDeleteConfirmation = true,
                            error = result.exception.message,
                        )
                    }
                }
                AppResult.Loading -> Unit
            }
        }

        private suspend fun restorePurchase() {
            when (val result = billingManager.restorePurchases()) {
                is AppResult.Success ->
                    setState {
                        copy(
                            profile =
                                state.value.profile?.copy(
                                    isPremium = result.data.isPremium,
                                    premiumExpiresAt = result.data.premiumExpiresAt,
                                ),
                        )
                    }
                is AppResult.Error -> setState { copy(error = result.exception.message) }
                AppResult.Loading -> Unit
            }
        }
    }
