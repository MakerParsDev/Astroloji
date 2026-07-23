package com.parsfilo.astrology.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import com.parsfilo.astrology.R

object NotificationChannels {
    const val DAILY_HOROSCOPE = "daily_horoscope"

    fun create(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel =
            NotificationChannel(
                DAILY_HOROSCOPE,
                context.getString(R.string.notification_channel_daily_name),
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = context.getString(R.string.notification_channel_daily_description)
                enableVibration(true)
            }
        context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }
}
