package com.parsfilo.astrology.core.data.repository

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.domain.model.RemoteFlags
import org.junit.Test

class RemoteConfigDefaultsTest {
    @Test
    fun `app open ads require a four hour background interval by default`() {
        assertThat(RemoteConfigDefaults.APP_OPEN_MIN_BACKGROUND_MS).isEqualTo(4L * 60L * 60L * 1_000L)
    }

    @Test
    fun `interstitial defaults protect retention`() {
        assertThat(RemoteConfigDefaults.INTERSTITIAL_FREQUENCY).isEqualTo(5L)
        assertThat(RemoteConfigDefaults.INTERSTITIAL_DAILY_LIMIT).isEqualTo(1L)
        assertThat(RemoteConfigDefaults.INTERSTITIAL_COOLDOWN_MINUTES).isEqualTo(30L)
    }

    @Test
    fun `domain fallback flags match retention safe defaults`() {
        val flags = RemoteFlags()

        assertThat(flags.interstitialFrequency)
            .isEqualTo(RemoteConfigDefaults.INTERSTITIAL_FREQUENCY.toInt())
        assertThat(flags.interstitialDailyLimit)
            .isEqualTo(RemoteConfigDefaults.INTERSTITIAL_DAILY_LIMIT.toInt())
        assertThat(flags.interstitialCooldownMinutes)
            .isEqualTo(RemoteConfigDefaults.INTERSTITIAL_COOLDOWN_MINUTES.toInt())
        assertThat(flags.appOpenMinBackgroundMs)
            .isEqualTo(RemoteConfigDefaults.APP_OPEN_MIN_BACKGROUND_MS)
    }

    @Test
    fun `onboarding paywall is disabled by default until explicitly enabled remotely`() {
        val flags = RemoteFlags()

        assertThat(flags.onboardingPaywallEnabled).isFalse()
        assertThat(flags.paywallVariant).isEqualTo("default")
    }
}
