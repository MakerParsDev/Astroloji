package com.parsfilo.astrology.core.ads

import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.ServerSideVerificationOptions
import com.google.common.truth.Truth.assertThat
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.slot
import org.junit.Test

class RewardedAdSsvTest {
    @Test
    fun `applies backend user and challenge to the rewarded ad`() {
        val ad = mockk<RewardedAd>()
        val options = slot<ServerSideVerificationOptions>()
        every { ad.setServerSideVerificationOptions(capture(options)) } just Runs

        applyRewardSsvOptions(
            ad = ad,
            userId = "user-1",
            customData = "challenge-1",
        )

        assertThat(options.captured.userId).isEqualTo("user-1")
        assertThat(options.captured.customData).isEqualTo("challenge-1")
    }
}
