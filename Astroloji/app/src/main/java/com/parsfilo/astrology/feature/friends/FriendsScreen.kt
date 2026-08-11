@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.friends

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.ui.components.AstrologyCard
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.ui.components.LoadingState
import com.parsfilo.astrology.core.ui.components.PremiumGoldButton

@Composable
fun FriendsScreen(
    modifier: Modifier = Modifier,
    viewModel: FriendsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val shareChooserTitle = stringResource(R.string.friends_share_cta)

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                is FriendsUiEffect.ShareInvite -> {
                    val message = context.getString(R.string.friends_share_message, effect.code)
                    val intent =
                        Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, message)
                        }
                    context.startActivity(Intent.createChooser(intent, shareChooserTitle))
                }
            }
        }
    }

    LaunchedEffect(Unit) {
        viewModel.onEvent(FriendsUiEvent.ScreenViewed)
    }

    if (uiState.isLoading) {
        LoadingState()
        return
    }

    CosmicBackground(modifier = modifier.fillMaxSize()) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(text = stringResource(R.string.friends_title), style = MaterialTheme.typography.displaySmall)
            InviteSection(uiState = uiState, onEvent = viewModel::onEvent)
            RedeemSection(uiState = uiState, onEvent = viewModel::onEvent)
            FriendsListSection(uiState = uiState, onEvent = viewModel::onEvent)
        }
    }
}

@Composable
private fun InviteSection(
    uiState: FriendsUiState,
    onEvent: (FriendsUiEvent) -> Unit,
) {
    AstrologyCard {
        Text(text = stringResource(R.string.friends_invite_section_title), style = MaterialTheme.typography.titleMedium)
        Text(text = stringResource(R.string.friends_invite_section_body), style = MaterialTheme.typography.bodyMedium)
        val code = uiState.inviteCode
        if (code != null) {
            Text(
                text = stringResource(R.string.friends_your_code_label, code),
                style = MaterialTheme.typography.headlineSmall,
            )
        }
        PremiumGoldButton(
            text =
                stringResource(
                    if (code == null) R.string.friends_generate_invite_cta else R.string.friends_share_cta,
                ),
            onClick = { onEvent(FriendsUiEvent.GenerateInvite) },
            enabled = !uiState.isGeneratingInvite,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun RedeemSection(
    uiState: FriendsUiState,
    onEvent: (FriendsUiEvent) -> Unit,
) {
    AstrologyCard {
        Text(text = stringResource(R.string.friends_redeem_section_title), style = MaterialTheme.typography.titleMedium)
        OutlinedTextField(
            value = uiState.redeemCodeInput,
            onValueChange = { onEvent(FriendsUiEvent.RedeemCodeChanged(it)) },
            placeholder = { Text(stringResource(R.string.friends_redeem_placeholder)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        uiState.error?.let {
            Text(text = it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
        uiState.infoMessage?.let {
            Text(text = it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
        }
        PremiumGoldButton(
            text = stringResource(R.string.friends_redeem_cta),
            onClick = { onEvent(FriendsUiEvent.RedeemCode) },
            enabled = !uiState.isRedeeming && uiState.redeemCodeInput.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun FriendsListSection(
    uiState: FriendsUiState,
    onEvent: (FriendsUiEvent) -> Unit,
) {
    AstrologyCard {
        Text(text = stringResource(R.string.friends_list_title), style = MaterialTheme.typography.titleMedium)
        if (uiState.friends.isEmpty()) {
            Text(text = stringResource(R.string.friends_list_empty), style = MaterialTheme.typography.bodyMedium)
        } else {
            uiState.friends.forEach { friend ->
                FriendRow(friend = friend, onRemove = { onEvent(FriendsUiEvent.RemoveFriend(friend.userId)) })
            }
        }
    }
}

@Composable
private fun FriendRow(
    friend: FriendUiModel,
    onRemove: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "${friend.sign.symbol} ${friend.sign.localizedName(friend.language)}",
            style = MaterialTheme.typography.bodyLarge,
        )
        TextButton(onClick = onRemove) {
            Text(stringResource(R.string.friends_remove_cta))
        }
    }
}
