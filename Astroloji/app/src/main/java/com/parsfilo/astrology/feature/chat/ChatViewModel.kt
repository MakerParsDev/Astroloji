package com.parsfilo.astrology.feature.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.ChatTurn
import com.parsfilo.astrology.core.data.repository.ReadingRepository
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.TimeUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

private const val MAX_CLIENT_HISTORY_TURNS = 12

data class ChatUiState(
    val messages: List<ChatTurn> = emptyList(),
    val input: String = "",
    val isSending: Boolean = false,
    val error: String? = null,
    val insufficientCredits: Boolean = false,
    val balance: Int? = null,
)

sealed interface ChatUiEvent {
    data class InputChanged(
        val value: String,
    ) : ChatUiEvent

    data object Send : ChatUiEvent

    data object DismissError : ChatUiEvent
}

@HiltViewModel
class ChatViewModel
    @Inject
    constructor(
        private val readingRepository: ReadingRepository,
        private val preferencesRepository: UserPreferencesRepository,
        private val analyticsRepository: AnalyticsRepository,
    ) : ViewModel() {
        private val _uiState = MutableStateFlow(ChatUiState())
        val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

        fun onEvent(event: ChatUiEvent) {
            when (event) {
                is ChatUiEvent.InputChanged -> _uiState.update { it.copy(input = event.value) }
                ChatUiEvent.Send -> send()
                ChatUiEvent.DismissError -> _uiState.update { it.copy(error = null, insufficientCredits = false) }
            }
        }

        private fun send() {
            val message = _uiState.value.input.trim()
            if (message.isEmpty() || _uiState.value.isSending) return
            val history = _uiState.value.messages.takeLast(MAX_CLIENT_HISTORY_TURNS * 2)
            _uiState.update {
                it.copy(
                    isSending = true,
                    error = null,
                    insufficientCredits = false,
                    input = "",
                    messages = it.messages + ChatTurn(role = "user", content = message),
                )
            }
            viewModelScope.launch {
                val language = TimeUtils.normalizeLanguageTag(preferencesRepository.current().language)
                when (val result = readingRepository.sendChatMessage(language, message, history)) {
                    is AppResult.Success -> {
                        _uiState.update {
                            it.copy(
                                isSending = false,
                                balance = result.data.balance,
                                messages = it.messages + ChatTurn(role = "assistant", content = result.data.reply),
                            )
                        }
                        analyticsRepository.track(AnalyticsEvents.CREDIT_SPENT, mapOf("feature" to "chat_consultation"))
                    }
                    is AppResult.Error -> {
                        val insufficientCredits = result.exception is AppException.BillingException
                        _uiState.update {
                            it.copy(
                                isSending = false,
                                error = result.exception.message,
                                insufficientCredits = insufficientCredits,
                                input = message,
                                messages = it.messages.dropLast(1),
                            )
                        }
                    }
                    AppResult.Loading -> Unit
                }
            }
        }
    }
