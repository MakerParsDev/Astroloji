package com.parsfilo.astrology.feature.settings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.parsfilo.astrology.BuildConfig
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.ui.components.AstrologyCard
import com.parsfilo.astrology.core.ui.components.CosmicBackground
import com.parsfilo.astrology.core.ui.components.DetailChip
import com.parsfilo.astrology.core.ui.components.ErrorState
import com.parsfilo.astrology.core.ui.components.LoadingState
import com.parsfilo.astrology.core.util.AppLanguageManager
import com.parsfilo.astrology.core.util.ZodiacSign
import java.util.Locale

@Suppress("LongMethod", "CyclomaticComplexMethod", "FunctionNaming", "LongParameterList")
@Composable
fun SettingsScreen(
    onOpenPremium: () -> Unit,
    onOpenPersonalGuidance: () -> Unit,
    onOpenFriends: () -> Unit,
    onOpenReading: () -> Unit,
    onOpenChat: () -> Unit,
    onOpenCredits: () -> Unit,
    onAccountDeleted: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                SettingsEffect.AccountDeleted -> onAccountDeleted()
            }
        }
    }
    if (uiState.isLoading) {
        LoadingState()
        return
    }

    val currentSign = ZodiacSign.fromKey(uiState.profile?.sign ?: "aries")
    val configuration = LocalConfiguration.current
    val context = LocalContext.current
    val appLanguage =
        com.parsfilo.astrology.core.util.TimeUtils
            .normalizeLanguageTag(configuration.locales[0].language)

    CosmicBackground(modifier = modifier.fillMaxSize()) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            SettingsPremiumOverview(
                currentSign = currentSign,
                language = appLanguage,
                onChangeSign = { signKey ->
                    viewModel.onEvent(SettingsUiEvent.ChangeSign(signKey))
                },
            )

            AstrologyCard {
                Text(
                    text = stringResource(R.string.chart_settings_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = stringResource(R.string.chart_settings_body),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = onOpenPersonalGuidance,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.chart_settings_cta))
                }
            }

            AstrologyCard {
                Text(
                    text = stringResource(R.string.friends_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = stringResource(R.string.friends_invite_section_body),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = onOpenFriends,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.friends_title))
                }
            }

            AstrologyCard {
                Text(
                    text = stringResource(R.string.ai_features_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = stringResource(R.string.ai_features_body),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = onOpenReading,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.reading_title))
                }
                Button(
                    onClick = onOpenChat,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.chat_title))
                }
                Button(
                    onClick = onOpenCredits,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.credits_title))
                }
            }

            AstrologyCard {
                Text(
                    text = stringResource(R.string.settings_premium_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Surface(
                    shape = RoundedCornerShape(18.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f),
                ) {
                    Row(
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .padding(14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(
                                text =
                                    if (uiState.profile?.isPremium == true) {
                                        stringResource(R.string.settings_premium_active)
                                    } else {
                                        stringResource(R.string.settings_premium_inactive)
                                    },
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                text =
                                    if (uiState.profile?.isPremium == true) {
                                        stringResource(R.string.settings_premium_member)
                                    } else {
                                        stringResource(R.string.settings_premium_free)
                                    },
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Button(
                            onClick = onOpenPremium,
                            colors =
                                ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.secondary,
                                    contentColor = MaterialTheme.colorScheme.onSecondary,
                                ),
                        ) {
                            Text(stringResource(R.string.settings_view_premium))
                        }
                    }
                }
            }

            AstrologyCard {
                Text(
                    text = stringResource(R.string.settings_notifications_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.settings_daily_notification),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    Switch(
                        checked = uiState.notificationEnabled,
                        onCheckedChange = { viewModel.onEvent(SettingsUiEvent.ChangeNotificationEnabled(it)) },
                    )
                }
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    listOf(7, 8, 9, 20, 21).forEach { hour ->
                        val selected = uiState.notificationHour == hour
                        Surface(
                            shape = RoundedCornerShape(16.dp),
                            color =
                                if (selected) {
                                    MaterialTheme.colorScheme.secondary.copy(alpha = 0.18f)
                                } else {
                                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.62f)
                                },
                            border =
                                BorderStroke(
                                    1.dp,
                                    if (selected) {
                                        MaterialTheme.colorScheme.secondary.copy(alpha = 0.45f)
                                    } else {
                                        MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f)
                                    },
                                ),
                            onClick = { viewModel.onEvent(SettingsUiEvent.ChangeNotificationHour(hour)) },
                        ) {
                            Text(
                                text = String.format(Locale.ROOT, "%02d:00", hour),
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                                style = MaterialTheme.typography.labelLarge,
                            )
                        }
                    }
                }
            }

            AstrologyCard {
                Text(
                    text = stringResource(R.string.settings_appearance_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                SettingsSegmentRow(
                    title = stringResource(R.string.settings_theme_title),
                    options =
                        listOf(
                            "system" to stringResource(R.string.settings_theme_system),
                            "light" to stringResource(R.string.settings_theme_light),
                            "dark" to stringResource(R.string.settings_theme_dark),
                        ),
                    selected = uiState.theme,
                    onSelect = { viewModel.onEvent(SettingsUiEvent.ChangeTheme(it)) },
                )
                SettingsSegmentRow(
                    title = stringResource(R.string.settings_language_title),
                    options =
                        listOf(
                            "tr" to stringResource(R.string.language_name_turkish),
                            "en" to stringResource(R.string.language_name_english),
                            "es" to stringResource(R.string.language_name_spanish),
                            "pt" to stringResource(R.string.language_name_portuguese),
                        ),
                    selected = uiState.language,
                    onSelect = {
                        AppLanguageManager.applyLanguage(context, it)
                        viewModel.onEvent(SettingsUiEvent.ChangeLanguage(it))
                    },
                )
            }

            AstrologyCard {
                Text(
                    text = stringResource(R.string.settings_favorites_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                if (uiState.favorites.isEmpty()) {
                    Text(
                        text = stringResource(R.string.settings_no_favorites),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    uiState.favorites.forEach { sign ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            DetailChip(text = ZodiacSign.fromKey(sign).localizedName(appLanguage))
                            OutlinedButton(onClick = { viewModel.onEvent(SettingsUiEvent.RemoveFavorite(sign)) }) {
                                Text(stringResource(R.string.favorites_remove))
                            }
                        }
                    }
                }
            }

            AstrologyCard {
                Text(
                    text = stringResource(R.string.settings_about_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                SettingsAboutRow(
                    stringResource(R.string.settings_version),
                    stringResource(R.string.settings_version_value, BuildConfig.VERSION_NAME),
                )
                SettingsAboutRow(stringResource(R.string.settings_privacy), "↗")
                SettingsAboutRow(stringResource(R.string.settings_contact), "↗")
                OutlinedButton(onClick = { viewModel.onEvent(SettingsUiEvent.RestorePurchase) }) {
                    Text(stringResource(R.string.settings_restore))
                }
            }

            AstrologyCard {
                Text(
                    text = stringResource(R.string.settings_account_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.error,
                )
                Text(
                    text = stringResource(R.string.settings_account_description),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OutlinedButton(
                    onClick = { viewModel.onEvent(SettingsUiEvent.RequestAccountDeletion) },
                    enabled = !uiState.isDeletingAccount,
                    colors =
                        ButtonDefaults.outlinedButtonColors(
                            contentColor = MaterialTheme.colorScheme.error,
                        ),
                ) {
                    Text(
                        stringResource(
                            if (uiState.isDeletingAccount) {
                                R.string.settings_delete_account_progress
                            } else {
                                R.string.settings_delete_account
                            },
                        ),
                    )
                }
            }

            uiState.error?.let { ErrorState(message = it, onRetry = {}) }
        }
    }

    if (uiState.showDeleteConfirmation) {
        AlertDialog(
            onDismissRequest = {
                if (!uiState.isDeletingAccount) {
                    viewModel.onEvent(SettingsUiEvent.DismissAccountDeletion)
                }
            },
            title = { Text(stringResource(R.string.settings_delete_dialog_title)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.settings_delete_dialog_body))
                    uiState.error?.let { error ->
                        Text(
                            text = error,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = { viewModel.onEvent(SettingsUiEvent.ConfirmAccountDeletion) },
                    enabled = !uiState.isDeletingAccount,
                    colors =
                        ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.error,
                            contentColor = MaterialTheme.colorScheme.onError,
                        ),
                ) {
                    Text(
                        stringResource(
                            if (uiState.isDeletingAccount) {
                                R.string.settings_delete_account_progress
                            } else {
                                R.string.settings_delete_dialog_confirm
                            },
                        ),
                    )
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { viewModel.onEvent(SettingsUiEvent.DismissAccountDeletion) },
                    enabled = !uiState.isDeletingAccount,
                ) {
                    Text(stringResource(R.string.settings_delete_dialog_cancel))
                }
            },
        )
    }
}

@Composable
private fun SettingsSegmentRow(
    title: String,
    options: List<Pair<String, String>>,
    selected: String,
    onSelect: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
        )
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .background(
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f),
                        RoundedCornerShape(18.dp),
                    ).padding(6.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            options.forEach { (key, label) ->
                val isSelected = key == selected
                Surface(
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(14.dp),
                    color =
                        if (isSelected) {
                            MaterialTheme.colorScheme.secondary.copy(alpha = 0.22f)
                        } else {
                            androidx.compose.ui.graphics.Color.Transparent
                        },
                    onClick = { onSelect(key) },
                ) {
                    Text(
                        text = label,
                        modifier = Modifier.padding(vertical = 12.dp),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                        color =
                            if (isSelected) {
                                MaterialTheme.colorScheme.secondary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                    )
                }
            }
        }
    }
}

@Composable
private fun SettingsAboutRow(
    label: String,
    trailing: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = label, style = MaterialTheme.typography.bodyLarge)
        Text(text = trailing, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
