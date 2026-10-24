package com.parsfilo.astrology.core.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.ui.theme.AstrolojiTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PremiumHeroLargeFontTest {
    @get:Rule val rule = createComposeRule()

    private fun titleLeftAt(fontScale: Float): Float {
        rule.setContent {
            CompositionLocalProvider(LocalDensity provides Density(density = 1f, fontScale = fontScale)) {
                AstrolojiTheme(darkTheme = false) {
                    Box(Modifier.width(320.dp)) {
                        PremiumHeroCard(
                            symbol = "♎",
                            eyebrow = "Libra",
                            title = "Today's Horoscope",
                            subtitle = "Sep 23 - Oct 22",
                        )
                    }
                }
            }
        }
        return rule
            .onNodeWithText("Today's Horoscope")
            .fetchSemanticsNode()
            .boundsInRoot.left
    }

    @Test fun heroTitleGetsFullLineWidthAtLargeScale() {
        assertThat(titleLeftAt(2f)).isLessThan(60f)
    }

    @Test fun standardScaleKeepsHorizontalIdentityLayout() {
        assertThat(titleLeftAt(1f)).isGreaterThan(100f)
    }
}
