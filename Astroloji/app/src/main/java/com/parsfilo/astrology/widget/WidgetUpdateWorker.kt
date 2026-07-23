package com.parsfilo.astrology.widget

import android.content.Context
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class WidgetUpdateWorker(
    appContext: Context,
    workerParams: WorkerParameters,
) : CoroutineWorker(appContext, workerParams) {
    override suspend fun doWork(): Result {
        val manager = GlanceAppWidgetManager(applicationContext)
        val glanceIds = manager.getGlanceIds(DailyHoroscopeWidget::class.java)
        val widget = DailyHoroscopeWidget()
        glanceIds.forEach { widget.update(applicationContext, it) }
        return Result.success()
    }
}
