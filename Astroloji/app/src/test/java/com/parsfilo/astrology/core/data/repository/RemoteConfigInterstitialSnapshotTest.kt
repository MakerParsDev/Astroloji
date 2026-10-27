package com.parsfilo.astrology.core.data.repository

import com.google.common.truth.Truth.assertThat
import com.google.firebase.remoteconfig.FirebaseRemoteConfig
import com.google.firebase.remoteconfig.FirebaseRemoteConfigValue
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.Test

class RemoteConfigInterstitialSnapshotTest {
    private val remoteConfig = mockk<FirebaseRemoteConfig>()

    @Test
    fun `back navigation skips ads if interstitial policy is not initialized`() {
        val staticValue = mockk<FirebaseRemoteConfigValue>()
        every { staticValue.source } returns FirebaseRemoteConfig.VALUE_SOURCE_STATIC
        every { remoteConfig.getValue(any()) } returns staticValue

        assertThat(RemoteConfigRepository(remoteConfig).cachedInterstitialFlagsOrNull()).isNull()
        verify(exactly = 0) { remoteConfig.fetchAndActivate() }
    }

    @Test
    fun `back navigation reads activated limits without an asynchronous fetch`() {
        val defaultValue = mockk<FirebaseRemoteConfigValue>()
        every { defaultValue.source } returns FirebaseRemoteConfig.VALUE_SOURCE_DEFAULT
        every { remoteConfig.getValue(any()) } returns defaultValue
        every { remoteConfig.getLong(RemoteConfigKeys.INTERSTITIAL_FREQUENCY) } returns 5L
        every { remoteConfig.getLong(RemoteConfigKeys.INTERSTITIAL_DAILY_LIMIT) } returns 1L
        every { remoteConfig.getLong(RemoteConfigKeys.INTERSTITIAL_COOLDOWN_MINUTES) } returns 30L

        val flags = RemoteConfigRepository(remoteConfig).cachedInterstitialFlagsOrNull()

        assertThat(flags).isNotNull()
        assertThat(flags!!.interstitialFrequency).isEqualTo(5)
        assertThat(flags.interstitialDailyLimit).isEqualTo(1)
        assertThat(flags.interstitialCooldownMinutes).isEqualTo(30)
        verify(exactly = 0) { remoteConfig.fetchAndActivate() }
    }

    @Test
    fun `missing cooldown prevents interstitial even when daily cap is present`() {
        val defaultValue = mockk<FirebaseRemoteConfigValue>()
        val staticValue = mockk<FirebaseRemoteConfigValue>()
        every { defaultValue.source } returns FirebaseRemoteConfig.VALUE_SOURCE_DEFAULT
        every { staticValue.source } returns FirebaseRemoteConfig.VALUE_SOURCE_STATIC
        every { remoteConfig.getValue(any()) } answers {
            if (firstArg<String>() == RemoteConfigKeys.INTERSTITIAL_COOLDOWN_MINUTES) staticValue else defaultValue
        }

        assertThat(RemoteConfigRepository(remoteConfig).cachedInterstitialFlagsOrNull()).isNull()
        verify(exactly = 0) { remoteConfig.fetchAndActivate() }
    }
}
