package com.parsfilo.astrology.feature.friends

import androidx.lifecycle.viewModelScope
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.FriendsRepository
import com.parsfilo.astrology.core.ui.MviViewModel
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.StringsProvider
import com.parsfilo.astrology.core.util.ZodiacSign
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

data class FriendUiModel(
    val userId: String,
    val sign: ZodiacSign,
    val language: String,
)

data class FriendsUiState(
    val isLoading: Boolean = true,
    val friends: List<FriendUiModel> = emptyList(),
    val inviteCode: String? = null,
    val isGeneratingInvite: Boolean = false,
    val redeemCodeInput: String = "",
    val isRedeeming: Boolean = false,
    val error: String? = null,
    val infoMessage: String? = null,
)

sealed interface FriendsUiEvent {
    data object ScreenViewed : FriendsUiEvent

    data object GenerateInvite : FriendsUiEvent

    data class RedeemCodeChanged(
        val value: String,
    ) : FriendsUiEvent

    data object RedeemCode : FriendsUiEvent

    data class RemoveFriend(
        val friendUserId: String,
    ) : FriendsUiEvent

    data object DismissMessages : FriendsUiEvent
}

sealed interface FriendsUiEffect {
    data class ShareInvite(
        val code: String,
    ) : FriendsUiEffect
}

@HiltViewModel
class FriendsViewModel
    @Inject
    constructor(
        private val friendsRepository: FriendsRepository,
        private val analyticsRepository: AnalyticsRepository,
        private val stringsProvider: StringsProvider,
    ) : MviViewModel<FriendsUiState, FriendsUiEvent, FriendsUiEffect>(FriendsUiState()) {
        init {
            loadFriends()
        }

        override fun onEvent(event: FriendsUiEvent) {
            when (event) {
                FriendsUiEvent.ScreenViewed -> Unit
                FriendsUiEvent.GenerateInvite -> generateInvite()
                is FriendsUiEvent.RedeemCodeChanged ->
                    setState { copy(redeemCodeInput = event.value.uppercase(), error = null, infoMessage = null) }
                FriendsUiEvent.RedeemCode -> redeemCode()
                is FriendsUiEvent.RemoveFriend -> removeFriend(event.friendUserId)
                FriendsUiEvent.DismissMessages -> setState { copy(error = null, infoMessage = null) }
            }
        }

        private fun loadFriends() {
            viewModelScope.launch {
                setState { copy(isLoading = true) }
                when (val result = friendsRepository.getFriends()) {
                    is AppResult.Success -> {
                        val friends =
                            result.data.mapNotNull { friend ->
                                ZodiacSign.fromKeyOrNull(friend.sign)?.let { sign ->
                                    FriendUiModel(userId = friend.userId, sign = sign, language = friend.language)
                                }
                            }
                        setState { copy(isLoading = false, friends = friends) }
                    }
                    is AppResult.Error ->
                        setState { copy(isLoading = false, error = result.exception.message) }
                    AppResult.Loading -> Unit
                }
            }
        }

        private fun generateInvite() {
            viewModelScope.launch {
                setState { copy(isGeneratingInvite = true, error = null) }
                when (val result = friendsRepository.createInvite()) {
                    is AppResult.Success -> {
                        setState { copy(isGeneratingInvite = false, inviteCode = result.data.code) }
                        analyticsRepository.track(AnalyticsEvents.FRIEND_INVITED, emptyMap())
                        sendEffect { FriendsUiEffect.ShareInvite(result.data.code) }
                    }
                    is AppResult.Error ->
                        setState { copy(isGeneratingInvite = false, error = result.exception.message) }
                    AppResult.Loading -> Unit
                }
            }
        }

        private fun redeemCode() {
            val code = state.value.redeemCodeInput.trim()
            if (code.isEmpty()) return
            viewModelScope.launch {
                setState { copy(isRedeeming = true, error = null, infoMessage = null) }
                when (val result = friendsRepository.acceptInvite(code)) {
                    is AppResult.Success -> {
                        val message = stringsProvider.get(R.string.friends_accept_success)
                        setState { copy(isRedeeming = false, redeemCodeInput = "", infoMessage = message) }
                        analyticsRepository.track(AnalyticsEvents.FRIEND_ACCEPTED, emptyMap())
                        loadFriends()
                    }
                    is AppResult.Error ->
                        setState { copy(isRedeeming = false, error = result.exception.message) }
                    AppResult.Loading -> Unit
                }
            }
        }

        private fun removeFriend(friendUserId: String) {
            viewModelScope.launch {
                when (val result = friendsRepository.removeFriend(friendUserId)) {
                    is AppResult.Success -> loadFriends()
                    is AppResult.Error -> setState { copy(error = result.exception.message) }
                    AppResult.Loading -> Unit
                }
            }
        }
    }
