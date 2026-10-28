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
    fun `oversized remote pacing values must not wrap into permissive integers`() {
        val value = mockk<FirebaseRemoteConfigValue>()
        every { value.source } returns FirebaseRemoteConfig.VALUE_SOURCE_REMOTE
        every { remoteConfig.getValue(any()) } returns value
        // Long -> Int would turn these into frequency=1 and cooldown=0.
        every { remoteConfig.getLong(RemoteConfigKeys.INTERSTITIAL_FREQUENCY) } returns 4_294_967_297L
        every { remoteConfig.getLong(RemoteConfigKeys.INTERSTITIAL_DAILY_LIMIT) } returns 1L
        every { remoteConfig.getLong(RemoteConfigKeys.INTERSTITIAL_COOLDOWN_MINUTES) } returns 4_294_967_296L

        val flags = RemoteConfigRepository(remoteConfig).cachedInterstitialFlagsOrNull()

        assertThat(flags).isNotNull()
        assertThat(flags!!.interstitialFrequency).isEqualTo(0)
        assertThat(flags.interstitialCooldownMinutes).isEqualTo(Int.MAX_VALUE)
        verify(exactly = 0) { remoteConfig.fetchAndActivate() }
    }

    @Test
    fun `invalid negative remote pacing values fail closed`() {
        val value = mockk<FirebaseRemoteConfigValue>()
        every { value.source } returns FirebaseRemoteConfig.VALUE_SOURCE_REMOTE
        every { remoteConfig.getValue(any()) } returns value
        every { remoteConfig.getLong(RemoteConfigKeys.INTERSTITIAL_FREQUENCY) } returns -1L
        every { remoteConfig.getLong(RemoteConfigKeys.INTERSTITIAL_DAILY_LIMIT) } returns 1L
        every { remoteConfig.getLong(RemoteConfigKeys.INTERSTITIAL_COOLDOWN_MINUTES) } returns -1L

        val flags = RemoteConfigRepository(remoteConfig).cachedInterstitialFlagsOrNull()

        assertThat(flags).isNotNull()
        assertThat(flags!!.interstitialFrequency).isEqualTo(0)
        assertThat(flags.interstitialCooldownMinutes).isEqualTo(Int.MAX_VALUE)
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
