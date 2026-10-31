package com.parsfilo.astrology

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class MainActivityAdsStartupOrderTest {
    @Test
    fun `slow remote config does not delay consent but safely holds ad preloading`() =
        runTest {
            val steps = mutableListOf<String>()
            val pendingNetwork = CompletableDeferred<Int>()

            val result =
                async {
                    prepareStartupWithConsentFirst(
                        gatherConsent = { steps += "consent" },
                        persistConsent = { steps += "persist" },
                        initializeAds = { steps += "initialize" },
                        preloadAds = { steps += "preload" },
                        fetchRemoteConfig = {
                            steps += "remote-config"
                            pendingNetwork.await()
                        },
                    )
                }

            runCurrent()
            assertThat(steps).containsExactly("consent", "persist", "remote-config").inOrder()
            assertThat(result.isCompleted).isFalse()

            pendingNetwork.complete(42)
            assertThat(result.await()).isEqualTo(42)
            assertThat(steps)
                .containsExactly("consent", "persist", "remote-config", "initialize", "preload")
                .inOrder()
        }

    @Test
    fun `consent failure prevents ad requests and later remote config fetch`() =
        runTest {
            val steps = mutableListOf<String>()
            val error =
                runCatching {
                    prepareStartupWithConsentFirst(
                        gatherConsent = {
                            steps += "consent"
                            error("UMP update failed before fallback")
                        },
                        persistConsent = { steps += "persist" },
                        initializeAds = { steps += "initialize" },
                        preloadAds = { steps += "preload" },
                        fetchRemoteConfig = {
                            steps += "remote-config"
                            7
                        },
                    )
                }

            assertThat(error.isFailure).isTrue()
            assertThat(steps).containsExactly("consent")
        }

    @Test
    fun `a remote config failure occurs after consent but before ad initialization`() =
        runTest {
            val steps = mutableListOf<String>()
            val error =
                runCatching {
                    prepareStartupWithConsentFirst(
                        gatherConsent = { steps += "consent" },
                        persistConsent = { steps += "persist" },
                        initializeAds = { steps += "initialize" },
                        preloadAds = { steps += "preload" },
                        fetchRemoteConfig = {
                            steps += "remote-config"
                            error("network unavailable")
                        },
                    )
                }

            assertThat(error.isFailure).isTrue()
            assertThat(steps).containsExactly("consent", "persist", "remote-config").inOrder()
        }
}
