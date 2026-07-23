package com.parsfilo.astrology.core.util

import android.content.Context
import android.content.Intent
import android.net.Uri

fun openSubscriptionManagement(
    context: Context,
    packageName: String = context.packageName,
) {
    val intent =
        Intent(
            Intent.ACTION_VIEW,
            Uri.parse("https://play.google.com/store/account/subscriptions?package=$packageName"),
        )
    context.startActivity(intent)
}
