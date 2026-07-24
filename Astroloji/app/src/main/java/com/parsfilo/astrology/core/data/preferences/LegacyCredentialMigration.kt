package com.parsfilo.astrology.core.data.preferences

import androidx.datastore.core.DataMigration
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.stringPreferencesKey

private object LegacyCredentialPreferenceKeys {
    val EMAIL = stringPreferencesKey("fallback_auth_email")
    val PASSWORD = stringPreferencesKey("fallback_auth_password")
}

internal object RemoveLegacyFallbackCredentialsMigration : DataMigration<Preferences> {
    override suspend fun shouldMigrate(currentData: Preferences): Boolean =
        currentData.contains(LegacyCredentialPreferenceKeys.EMAIL) ||
            currentData.contains(LegacyCredentialPreferenceKeys.PASSWORD)

    override suspend fun migrate(currentData: Preferences): Preferences {
        if (!shouldMigrate(currentData)) return currentData

        return currentData
            .toMutablePreferences()
            .apply { removeLegacyFallbackCredentials() }
            .toPreferences()
    }

    override suspend fun cleanUp() = Unit
}

internal fun MutablePreferences.removeLegacyFallbackCredentials() {
    remove(LegacyCredentialPreferenceKeys.EMAIL)
    remove(LegacyCredentialPreferenceKeys.PASSWORD)
}
