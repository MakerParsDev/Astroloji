package com.parsfilo.astrology.core.util

import android.content.Context
import android.content.Intent
import androidx.core.net.toUri

fun openSubscriptionManagement(
    context: Context,
    packageName: String = context.packageName,
) {
    val intent =
        Intent(
            Intent.ACTION_VIEW,
            "https://play.google.com/store/account/subscriptions?package=$packageName".toUri(),
        )
    context.startActivity(intent)
}
