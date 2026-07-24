package com.parsfilo.astrology.core.data.preferences

import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.mutablePreferencesOf
import androidx.datastore.preferences.core.stringPreferencesKey
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class LegacyCredentialMigrationTest {
    private val legacyEmail = stringPreferencesKey("fallback_auth_email")
    private val legacyPassword = stringPreferencesKey("fallback_auth_password")
    private val onboardingCompleted = booleanPreferencesKey("onboarding_completed")

    @Test
    fun `migration runs when either legacy credential field exists`() =
        runTest {
            val emailOnly = mutablePreferencesOf(legacyEmail to "legacy-email")
            val passwordOnly = mutablePreferencesOf(legacyPassword to "legacy-password")

            assertThat(RemoveLegacyFallbackCredentialsMigration.shouldMigrate(emailOnly)).isTrue()
            assertThat(RemoveLegacyFallbackCredentialsMigration.shouldMigrate(passwordOnly)).isTrue()
        }

    @Test
    fun `migration removes legacy credentials and preserves unrelated preferences`() =
        runTest {
            val current =
                mutablePreferencesOf(
                    legacyEmail to "legacy-email",
                    legacyPassword to "legacy-password",
                    onboardingCompleted to true,
                )

            val migrated = RemoveLegacyFallbackCredentialsMigration.migrate(current)

            assertThat(migrated[legacyEmail]).isNull()
            assertThat(migrated[legacyPassword]).isNull()
            assertThat(migrated[onboardingCompleted]).isTrue()
        }

    @Test
    fun `migration is idempotent after legacy fields are removed`() =
        runTest {
            val current = mutablePreferencesOf(onboardingCompleted to true)

            assertThat(RemoveLegacyFallbackCredentialsMigration.shouldMigrate(current)).isFalse()
            assertThat(RemoveLegacyFallbackCredentialsMigration.migrate(current)).isEqualTo(current)
        }
}
