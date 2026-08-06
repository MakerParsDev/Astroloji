package com.parsfilo.astrology.feature.compatibility

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CompatibilityScorePresentationTest {
    @Test
    fun `locked score never appears as zero percent`() {
        assertThat(
            compatibilityScoreLabel(
                value = null,
                language = "tr",
                lockedLabel = "🔒 Premium",
            ),
        ).isEqualTo("🔒 Premium")
    }

    @Test
    fun `available score keeps localized percentage formatting`() {
        assertThat(
            compatibilityScoreLabel(
                value = 74,
                language = "tr",
                lockedLabel = "🔒 Premium",
            ),
        ).isEqualTo("%74")
    }
}
