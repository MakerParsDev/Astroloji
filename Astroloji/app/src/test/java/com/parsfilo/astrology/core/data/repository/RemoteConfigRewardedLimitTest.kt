package com.parsfilo.astrology.core.data.repository

import com.google.android.gms.tasks.Tasks
import com.google.common.truth.Truth.assertThat
import com.google.firebase.remoteconfig.FirebaseRemoteConfig
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Test

class RemoteConfigRewardedLimitTest {
    private val remoteConfig = mockk<FirebaseRemoteConfig>()

    @Test
    fun `reward unlocks stay disabled when remote limit wraps to a positive integer`() =
        runTest {
            every { remoteConfig.setConfigSettingsAsync(any()) } returns Tasks.forResult(null)
            every { remoteConfig.setDefaultsAsync(any<Map<String, Any>>()) } returns Tasks.forResult(null)
            every { remoteConfig.fetchAndActivate() } returns Tasks.forResult(false)
            every { remoteConfig.getLong(any()) } returns 0L
            every { remoteConfig.getBoolean(any()) } returns false
            every { remoteConfig.getString(any()) } returns "default"

            val cases =
                listOf(
                    -4_294_967_295L to 0,
                    4_294_967_297L to 0,
                    -1L to 0,
                    0L to 0,
                    1L to 1,
                    Int.MAX_VALUE.toLong() to Int.MAX_VALUE,
                )
            for ((rawLimit, expected) in cases) {
                every { remoteConfig.getLong(RemoteConfigKeys.REWARDED_DAILY_UNLOCK_LIMIT) } returns rawLimit

                val flags = RemoteConfigRepository(remoteConfig).fetchFlags()

                assertThat(flags.rewardedDailyUnlockLimit).isEqualTo(expected)
            }
        }
}
