package com.parsfilo.astrology.feature.personality

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.ContentRepository
import com.parsfilo.astrology.core.data.repository.FavoritesRepository
import com.parsfilo.astrology.core.domain.model.PersonalityReport
import com.parsfilo.astrology.core.ui.MviViewModel
import com.parsfilo.astrology.core.util.AppResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PersonalityUiState(
    val isLoading: Boolean = true,
    val isFavorite: Boolean = false,
    val report: PersonalityReport? = null,
    val error: String? = null,
)

sealed interface PersonalityUiEvent {
    data object ToggleFavorite : PersonalityUiEvent
}

@HiltViewModel
class PersonalityViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val contentRepository: ContentRepository,
        private val preferencesRepository: UserPreferencesRepository,
        private val analyticsRepository: AnalyticsRepository,
        private val favoritesRepository: FavoritesRepository,
    ) : MviViewModel<PersonalityUiState, PersonalityUiEvent, Unit>(PersonalityUiState()) {
        private val signFromArgs: String? = savedStateHandle.get<String>("sign")

        init {
            viewModelScope.launch {
                val sign = signFromArgs ?: preferencesRepository.current().selectedSign
                val prefs = preferencesRepository.current()
                val favorites = favoritesRepository.getFavorites().toSet()
                analyticsRepository.track(AnalyticsEvents.PERSONALITY_VIEWED, mapOf("sign" to sign))
                when (val result = contentRepository.getPersonality(sign, prefs.language)) {
                    is AppResult.Success ->
                        setState {
                            copy(
                                isLoading = false,
                                report = result.data,
                                isFavorite = sign in favorites,
                            )
                        }
                    is AppResult.Error -> setState { copy(isLoading = false, error = result.exception.message) }
                    AppResult.Loading -> Unit
                }
            }
        }

        override fun onEvent(event: PersonalityUiEvent) {
            if (event == PersonalityUiEvent.ToggleFavorite) {
                viewModelScope.launch {
                    val sign = signFromArgs ?: preferencesRepository.current().selectedSign
                    favoritesRepository.toggle(sign)
                    val favorites = favoritesRepository.getFavorites().toSet()
                    setState { copy(isFavorite = sign in favorites) }
                }
            }
        }
    }
