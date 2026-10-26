@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.feature.settings

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import com.parsfilo.astrology.R
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * A privacy form is an exclusive UI operation. Multiple fast taps must not start overlapping
 * UMP forms, but must never interfere with the SDK's actual consent or rejection decisions.
 */
@Composable
internal fun PrivacyOptionsButton(
    onShowForm: suspend () -> Boolean,
    onFormError: () -> Unit,
) {
    var showing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    OutlinedButton(
        enabled = !showing,
        onClick = {
            if (showing) return@OutlinedButton
            showing = true
            scope.launch {
                try {
                    if (!onShowForm()) onFormError()
                } catch (exception: CancellationException) {
                    throw exception
                } catch (_: Exception) {
                    onFormError()
                } finally {
                    showing = false
                }
            }
        },
        modifier = Modifier.fillMaxWidth().testTag("manage-ad-privacy"),
    ) {
        Text(stringResource(R.string.settings_manage_ad_privacy))
    }
}
