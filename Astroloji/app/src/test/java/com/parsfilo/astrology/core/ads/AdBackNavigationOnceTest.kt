package com.parsfilo.astrology.core.ads

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AdBackNavigationOnceTest {
    @Test
    fun `repeated back presses cannot create more than one pending operation`() {
        val guard = AdBackNavigationOnce()

        assertThat(guard.tryStart()).isTrue()
        repeat(20) {
            assertThat(guard.tryStart()).isFalse()
        }
    }

    @Test
    fun `a failed show fallback and delayed SDK callbacks navigate only once`() {
        val guard = AdBackNavigationOnce()
        var navigations = 0

        assertThat(guard.tryStart()).isTrue()
        guard.complete { navigations++ } // show() returned false
        guard.complete { navigations++ } // delayed onAdDismissed
        guard.complete { navigations++ } // delayed onAdFailedToShow

        assertThat(navigations).isEqualTo(1)
        assertThat(guard.tryStart()).isFalse()
    }

    @Test
    fun `normal SDK dismissal wins over a synchronous false fallback`() {
        val guard = AdBackNavigationOnce()
        var navigations = 0

        assertThat(guard.tryStart()).isTrue()
        guard.complete { navigations++ } // synchronous SDK callback
        guard.complete { navigations++ } // caller-side fallback
        assertThat(navigations).isEqualTo(1)
    }

    @Test
    fun `gate does not navigate until eligibility or ad outcome is known`() {
        val guard = AdBackNavigationOnce()
        var navigations = 0

        assertThat(guard.tryStart()).isTrue()
        assertThat(guard.tryStart()).isFalse()
        assertThat(navigations).isEqualTo(0)
        guard.complete { navigations++ }
        assertThat(navigations).isEqualTo(1)
    }
}
