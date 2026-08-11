package com.parsfilo.astrology.navigation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PaywallSourceTest {
    @Test
    fun `paywall sources expose stable unique analytics values`() {
        assertThat(PaywallSource.entries.map(PaywallSource::analyticsValue))
            .containsExactly(
                "nav",
                "daily_lock",
                "weekly_lock",
                "monthly_lock",
                "compat_lock",
                "personality_lock",
                "profile_upgrade",
                "onboarding",
            ).inOrder()
        assertThat(PaywallSource.entries.map(PaywallSource::analyticsValue).distinct())
            .hasSize(PaywallSource.entries.size)
    }

    @Test
    fun `premium route retains its source`() {
        assertThat(PremiumRoute(PaywallSource.COMPATIBILITY_LOCK).source)
            .isEqualTo(PaywallSource.COMPATIBILITY_LOCK)
    }
}
