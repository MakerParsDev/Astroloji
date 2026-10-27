@file:Suppress("TooGenericExceptionCaught", "FunctionNaming")

package com.parsfilo.astrology.core.ads

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * A BACK press is a single in-flight navigation request until the destination is disposed.
 * Another BACK while fetching flags or showing an ad must not bypass the ad.
 */
@Composable
fun InterstitialBackHandler(
    activity: Activity?,
    placement: String,
    onNavigateBack: () -> Unit,
) {
    val backNavigation = remember { AdBackNavigationOnce() }
    val scope = rememberCoroutineScope()

    BackHandler(enabled = activity != null) {
        val hostActivity = activity ?: return@BackHandler
        if (!backNavigation.tryStart()) return@BackHandler

        scope.launch {
            try {
                val entry = adsEntryPoint(hostActivity)
                // Use only already activated/default policy values here. Network
                // fetches can delay BACK; missing policy means no ad, not a wait.
                val flags = entry.remoteConfigRepository().cachedInterstitialFlagsOrNull()
                val eligible =
                    flags != null &&
                        entry.adEligibilityChecker().canShowInterstitial() &&
                        entry.adFrequencyManager().canShowInterstitialOnBack(flags)
                if (!eligible) {
                    backNavigation.complete(onNavigateBack)
                    return@launch
                }

                val shown =
                    entry.interstitialAdManager().showIfAvailable(
                        activity = hostActivity,
                        placement = placement,
                        onDismissed = { backNavigation.complete(onNavigateBack) },
                    )
                if (!shown) backNavigation.complete(onNavigateBack)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // A failed policy fetch or synchronous SDK failure must not
                // strand the user after BACK was consumed. No second ad show.
                Timber.w(e, "Interstitial back navigation failed")
                backNavigation.complete(onNavigateBack)
            }
        }
    }
}
