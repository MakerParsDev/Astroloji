package com.parsfilo.astrology.core.ads

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class BannerAdPolicyTest {
    @Test
    fun `banner hides when premium activates or UMP permission is revoked without navigation`() =
        runTest {
            val premium = MutableStateFlow(true)
            val consent = MutableStateFlow(false)
            val states = mutableListOf<Boolean>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                bannerEligibilityFlow(premium, consent).collect(states::add)
            }

            assertThat(states).containsExactly(false)
            consent.value = true // Consent alone must never override premium.
            assertThat(states).containsExactly(false)
            premium.value = false
            assertThat(states).containsExactly(false, true).inOrder()

            consent.value = false
            assertThat(states).containsExactly(false, true, false).inOrder()
            premium.value = true // Remains off after the premium purchase.
            consent.value = true
            assertThat(states).containsExactly(false, true, false).inOrder()
        }

    @Test
    fun `free user can resume banner only after consent is regained`() =
        runTest {
            val premium = MutableStateFlow(false)
            val consent = MutableStateFlow(false)
            val states = mutableListOf<Boolean>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                bannerEligibilityFlow(premium, consent).collect(states::add)
            }

            assertThat(states).containsExactly(false)
            consent.value = true
            consent.value = false
            consent.value = true
            assertThat(states).containsExactly(false, true, false, true).inOrder()
        }
}
