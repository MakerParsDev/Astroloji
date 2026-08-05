package com.parsfilo.astrology.navigation

import android.net.Uri
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ShareLinkContractTest {
    @Test
    fun `daily landing link contains only a normalized zodiac sign`() {
        assertThat(dailyShareLandingUrl("ARIES"))
            .isEqualTo("https://astrology.parsfilo.com/share/daily/aries")
        assertThat(dailyShareLandingUrl("unknown")).isNull()
    }

    @Test
    fun `compatibility landing link is canonical regardless of input order`() {
        assertThat(compatibilityShareLandingUrl("leo", "aries"))
            .isEqualTo("https://astrology.parsfilo.com/share/compat/aries/leo")
        assertThat(compatibilityShareLandingUrl("aries", "invalid")).isNull()
    }

    @Test
    fun `custom scheme parser accepts only the daily host and one valid sign segment`() {
        assertThat(parseAppDeepLink(Uri.parse("astrology://daily/aries")))
            .isEqualTo(AppDeepLink(type = "daily", sign = "aries"))
        assertThat(parseAppDeepLink(Uri.parse("astrology://daily/aries/extra"))).isNull()
        assertThat(parseAppDeepLink(Uri.parse("astrology://premium/aries"))).isNull()
        assertThat(parseAppDeepLink(Uri.parse("astrology://daily/not-a-sign"))).isNull()
        assertThat(parseAppDeepLink(Uri.parse("https://evil.example/daily/aries"))).isNull()
    }

    @Test
    fun `custom daily URI round trips through the parser`() {
        val uri = dailyAppUri("pisces")

        assertThat(uri).isEqualTo("astrology://daily/pisces")
        assertThat(parseAppDeepLink(Uri.parse(uri)))
            .isEqualTo(AppDeepLink(type = "daily", sign = "pisces"))
    }
}
