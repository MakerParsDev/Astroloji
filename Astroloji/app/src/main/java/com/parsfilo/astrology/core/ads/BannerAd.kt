package com.parsfilo.astrology.core.ads

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.google.android.gms.ads.AdListener
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import timber.log.Timber

@Composable
fun AdaptiveBannerAd(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val activity = context.findActivity() ?: return

    BoxWithConstraints(modifier = modifier.fillMaxWidth()) {
        val adWidth = maxWidth.value.toInt().coerceAtLeast(320)
        val adSize =
            remember(adWidth) {
                AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(activity, adWidth)
            }
        val adView =
            remember(adWidth) {
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

        DisposableEffect(adView) {
            onDispose { adView.destroy() }
        }

        AndroidView(
            factory = { adView },
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(adSize.getHeightInPixels(activity).dp),
        )
    }
}

private fun Context.findActivity(): Activity? =
    when (this) {
        is Activity -> this
        is ContextWrapper -> baseContext.findActivity()
        else -> null
    }
