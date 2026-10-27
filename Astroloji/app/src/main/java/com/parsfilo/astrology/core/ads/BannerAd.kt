package com.parsfilo.astrology.core.ads

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.google.android.gms.ads.AdListener
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import kotlinx.coroutines.flow.map
import timber.log.Timber

@Composable
fun AdaptiveBannerAd(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val activity = context.findActivity() ?: return
    val entryPoint = remember(context.applicationContext) { adsEntryPoint(context) }
    val bannerRevisionFlow =
        remember(entryPoint) {
            bannerPresentationRevisionFlow(
                entryPoint.userPreferencesRepository().preferences.map { it.isPremium },
                entryPoint.consentManager().consentSnapshotFlow,
            )
        }
    // Fail closed until the premium and UMP policy have both been observed.
    val displayRevision by bannerRevisionFlow.collectAsState(initial = null)
    val revision = displayRevision ?: return

    BoxWithConstraints(modifier = modifier.fillMaxWidth()) {
        val adWidth = maxWidth.value.toInt().coerceAtLeast(320)
        val adSize =
            remember(adWidth) {
                AdSize.getLargeAnchoredAdaptiveBannerAdSize(activity, adWidth)
            }
        val adView =
            remember(adWidth, revision) {
                AdView(activity).apply {
                    setAdUnitId(AdMobUnits.banner)
                    setAdSize(adSize)
                    adListener =
                        object : AdListener() {
                            override fun onAdLoaded() {
                                Timber.d("Banner ad loaded")
                            }

                            override fun onAdFailedToLoad(error: com.google.android.gms.ads.LoadAdError) {
                                Timber.w("Banner ad failed: %s", error.message)
                            }
                        }
                    loadAd(AdRequest.Builder().build())
                }
            }

        // AndroidView.factory runs only when the node is created. Key the
        // node to the AdView so consent or size changes dispose the old ad.
        key(adView) {
            DisposableEffect(adView) {
                onDispose { adView.destroy() }
            }

            AndroidView(
                factory = { adView },
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .height(adSize.height.dp),
            )
        }
    }
}

private fun Context.findActivity(): Activity? =
    when (this) {
        is Activity -> this
        is ContextWrapper -> baseContext.findActivity()
        else -> null
    }
