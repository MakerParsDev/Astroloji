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
    fun `banner stays hidden for premium even when consent state changes`() =
        runTest {
            val premium = MutableStateFlow(true)
            val consent = MutableStateFlow(AdConsentSnapshot(canRequestAds = true, revision = 0L))
            val revisions = mutableListOf<Long?>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                bannerPresentationRevisionFlow(premium, consent).collect(revisions::add)
            }

            assertThat(revisions).containsExactly(null)
            consent.value = AdConsentSnapshot(canRequestAds = true, revision = 1L)
            assertThat(revisions).containsExactly(null)
            premium.value = false
            assertThat(revisions).containsExactly(null, 1L).inOrder()
            premium.value = true
            assertThat(revisions).containsExactly(null, 1L, null).inOrder()
        }

    @Test
    fun `revoke permission unmounts an active banner even without navigation`() =
        runTest {
            val premium = MutableStateFlow(false)
            val consent = MutableStateFlow(AdConsentSnapshot(canRequestAds = true, revision = 2L))
            val revisions = mutableListOf<Long?>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                bannerPresentationRevisionFlow(premium, consent).collect(revisions::add)
            }

            consent.value = AdConsentSnapshot(canRequestAds = false, revision = 3L)
            consent.value = AdConsentSnapshot(canRequestAds = true, revision = 4L)
            assertThat(revisions).containsExactly(2L, null, 4L).inOrder()
        }

    @Test
    fun `privacy options update remounts banner when permission remains true`() =
        runTest {
            val premium = MutableStateFlow(false)
            val consent = MutableStateFlow(AdConsentSnapshot(canRequestAds = true, revision = 7L))
            val revisions = mutableListOf<Long?>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                bannerPresentationRevisionFlow(premium, consent).collect(revisions::add)
            }

            consent.value = AdConsentSnapshot(canRequestAds = true, revision = 8L)
            assertThat(revisions).containsExactly(7L, 8L).inOrder()
        }

    @Test
    fun `identical snapshots do not reload the creative`() =
        runTest {
            val premium = MutableStateFlow(false)
            val consent = MutableStateFlow(AdConsentSnapshot(canRequestAds = true, revision = 7L))
            val revisions = mutableListOf<Long?>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                bannerPresentationRevisionFlow(premium, consent).collect(revisions::add)
            }

            consent.value = AdConsentSnapshot(canRequestAds = true, revision = 7L)
            assertThat(revisions).containsExactly(7L)
        }
}
