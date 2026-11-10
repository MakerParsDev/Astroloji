package com.parsfilo.astrology.feature.settings

import android.content.Intent
import androidx.core.net.toUri
import android.provider.Settings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.parsfilo.astrology.R

@Composable
@Suppress("FunctionNaming")
internal fun SettingsAccountDeletionDialog(
    uiState: SettingsUiState,
    onEvent: (SettingsUiEvent) -> Unit,
    onOpenAppSettings: () -> Unit,
) {
    if (!uiState.showDeleteConfirmation) return

    val titleRes =
        if (uiState.accountDeletedOnServer) {
            R.string.settings_delete_local_cleanup_title
        } else {
            R.string.settings_delete_dialog_title
        }
    val dismissRes =
        if (uiState.accountDeletedOnServer) {
            R.string.settings_delete_dialog_close
        } else {
            R.string.settings_delete_dialog_cancel
        }

    AlertDialog(
        onDismissRequest = {
            if (!uiState.isDeletingAccount) onEvent(SettingsUiEvent.DismissAccountDeletion)
        },
        title = { Text(stringResource(titleRes)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (!uiState.accountDeletedOnServer) {
                    Text(stringResource(R.string.settings_delete_dialog_body))
                }
                uiState.error?.let { error ->
                    Text(
                        text = error,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                if (uiState.accountDeletedOnServer) {
                    OutlinedButton(
                        onClick = onOpenAppSettings,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(stringResource(R.string.settings_delete_open_app_settings))
                    }
                }
            }
        },
        confirmButton = {
            if (!uiState.accountDeletedOnServer) {
                SettingsAccountDeletionConfirmButton(
                    isDeleting = uiState.isDeletingAccount,
                    onConfirm = { onEvent(SettingsUiEvent.ConfirmAccountDeletion) },
                )
            }
        },
        dismissButton = {
            TextButton(
                onClick = { onEvent(SettingsUiEvent.DismissAccountDeletion) },
                enabled = !uiState.isDeletingAccount,
            ) {
                Text(stringResource(dismissRes))
            }
        },
    )
}

@Composable
@Suppress("FunctionNaming")
private fun SettingsAccountDeletionConfirmButton(
    isDeleting: Boolean,
    onConfirm: () -> Unit,
) {
    val labelRes =
        if (isDeleting) {
            R.string.settings_delete_account_progress
        } else {
            R.string.settings_delete_dialog_confirm
        }
    Button(
        onClick = onConfirm,
        enabled = !isDeleting,
        colors =
            ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.error,
                contentColor = MaterialTheme.colorScheme.onError,
            ),
    ) {
        Text(stringResource(labelRes))
    }
}

internal fun applicationDetailsSettingsIntent(packageName: String): Intent =
    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = "package:$packageName".toUri()
    }
