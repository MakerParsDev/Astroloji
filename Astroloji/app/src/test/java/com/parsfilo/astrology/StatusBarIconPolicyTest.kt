package com.parsfilo.astrology

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StatusBarIconPolicyTest {
    @Test
    fun darkAppThemeRequiresLegibleLightIcons() {
        assertThat(shouldUseDarkStatusBarIcons(darkAppTheme = true)).isFalse()
    }

    @Test
    fun lightAppThemeRequiresLegibleDarkIcons() {
        assertThat(shouldUseDarkStatusBarIcons(darkAppTheme = false)).isTrue()
    }
}
