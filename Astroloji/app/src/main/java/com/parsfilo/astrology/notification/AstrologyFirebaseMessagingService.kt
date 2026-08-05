package com.parsfilo.astrology.notification

import android.Manifest
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.parsfilo.astrology.MainActivity
import com.parsfilo.astrology.R
import timber.log.Timber
import java.util.concurrent.atomic.AtomicInteger

class AstrologyFirebaseMessagingService : FirebaseMessagingService() {
    companion object {
        private val notificationIdCounter = AtomicInteger(1000)
    }

    override fun onNewToken(token: String) {
        WorkManager
            .getInstance(applicationContext)
            .enqueue(OneTimeWorkRequestBuilder<TokenRefreshWorker>().build())
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val type = message.data["type"]
        val sign = message.data["sign"]
        val launchIntent =
            Intent(this, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                if (type == "daily" && !sign.isNullOrBlank()) {
                    data = "astrology://daily/$sign".toUri()
                    putExtra("deeplink_sign", sign)
                    putExtra("deeplink_type", type)
                }
            }
        val pendingIntent =
            PendingIntent.getActivity(
                this,
                1001,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        val notification =
            NotificationCompat
                .Builder(this, NotificationChannels.DAILY_HOROSCOPE)
                .setSmallIcon(R.drawable.ic_zodiac_generic)
                .setContentTitle(message.notification?.title ?: getString(R.string.notification_default_title))
                .setContentText(message.notification?.body ?: getString(R.string.notification_default_body))
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .build()
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        try {
            NotificationManagerCompat.from(this).notify(notificationIdCounter.getAndIncrement(), notification)
        } catch (exception: SecurityException) {
            Timber.w(exception, "Notification permission was revoked before delivery.")
        }
    }
}
