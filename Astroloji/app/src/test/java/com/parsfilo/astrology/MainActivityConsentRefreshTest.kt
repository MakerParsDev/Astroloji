package com.parsfilo.astrology

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.ads.AdConsentSnapshot
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class MainActivityConsentRefreshTest {
    @Test
    fun grantingAdsAfterInitialDenialRefreshesWithoutRestart() =
        runTest {
            val updates = MutableStateFlow(AdConsentSnapshot(false, 1L))
            val persisted = mutableListOf<Long>()
            val refreshes = mutableListOf<Long>()
            backgroundScope.launch {
                observeConsentChangesAfterStartup(
                    snapshots = updates,
                    onConsentChanged = { persisted += updates.value.revision },
                    reloadAllowedAds = { refreshes += updates.value.revision },
                )
            }
            runCurrent()
            assertThat(refreshes).isEmpty()
            assertThat(persisted).isEmpty()

            updates.value = AdConsentSnapshot(true, 2L)
            runCurrent()
            assertThat(refreshes).containsExactly(2L)
            assertThat(persisted).containsExactly(2L)

            updates.value = AdConsentSnapshot(false, 3L)
            runCurrent()
            assertThat(refreshes).containsExactly(2L)
            assertThat(persisted).containsExactly(2L, 3L).inOrder()

            updates.value = AdConsentSnapshot(true, 4L)
            runCurrent()
            assertThat(refreshes).containsExactly(2L, 4L).inOrder()
            assertThat(persisted).containsExactly(2L, 3L, 4L).inOrder()
        }

    @Test
    fun alreadyAllowedStartupDoesNotPreloadTwiceButNewRevisionRefreshes() =
        runTest {
            val updates = MutableStateFlow(AdConsentSnapshot(true, 6L))
            var refreshes = 0
            var persisted = 0
            backgroundScope.launch {
                observeConsentChangesAfterStartup(
                    snapshots = updates,
                    onConsentChanged = { persisted++ },
                    reloadAllowedAds = { refreshes++ },
                )
            }
            runCurrent()
            assertThat(refreshes).isEqualTo(0)
            assertThat(persisted).isEqualTo(0)

            updates.value = AdConsentSnapshot(true, 7L)
            runCurrent()
            assertThat(refreshes).isEqualTo(1)
            assertThat(persisted).isEqualTo(1)
        }
}
