package com.parsfilo.astrology.core.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AppLanguageManagerTest {
    @Test
    fun `startup locale sync does not recreate activity even when locale changes`() {
        val shouldRecreate =
            AppLanguageManager.shouldRecreateActivity(
                previousFrameworkTags = "tr",
                currentFrameworkTags = "en",
                previousCompatTags = "tr",
                currentCompatTags = "en",
                userInitiated = false,
            )

        assertThat(shouldRecreate).isFalse()
    }

    @Test
    fun `user initiated locale change recreates activity when locale changes`() {
        val shouldRecreate =
            AppLanguageManager.shouldRecreateActivity(
                previousFrameworkTags = "tr",
                currentFrameworkTags = "en",
                previousCompatTags = "tr",
                currentCompatTags = "en",
                userInitiated = true,
            )

        assertThat(shouldRecreate).isTrue()
    }

    @Test
    fun `user initiated no-op locale change does not recreate activity`() {
        val shouldRecreate =
            AppLanguageManager.shouldRecreateActivity(
                previousFrameworkTags = "en",
                currentFrameworkTags = "en",
                previousCompatTags = "en",
                currentCompatTags = "en",
                userInitiated = true,
            )

        assertThat(shouldRecreate).isFalse()
    }
}
