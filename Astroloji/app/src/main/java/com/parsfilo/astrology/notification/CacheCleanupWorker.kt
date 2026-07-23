package com.parsfilo.astrology.notification

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.parsfilo.astrology.core.data.local.CompatibilityDao
import com.parsfilo.astrology.core.data.local.DailyDao
import com.parsfilo.astrology.core.data.local.MonthlyDao
import com.parsfilo.astrology.core.data.local.PersonalityDao
import com.parsfilo.astrology.core.data.local.WeeklyDao
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@HiltWorker
class CacheCleanupWorker
    @AssistedInject
    constructor(
        @Assisted appContext: Context,
        @Assisted workerParams: WorkerParameters,
        private val dailyDao: DailyDao,
        private val weeklyDao: WeeklyDao,
        private val monthlyDao: MonthlyDao,
        private val compatibilityDao: CompatibilityDao,
        private val personalityDao: PersonalityDao,
    ) : CoroutineWorker(appContext, workerParams) {
        override suspend fun doWork(): Result =
            withContext(Dispatchers.IO) {
                val threshold = System.currentTimeMillis() - 30L * 24L * 60L * 60L * 1000L
                dailyDao.deleteOlderThan(threshold)
                weeklyDao.deleteOlderThan(threshold)
                monthlyDao.deleteOlderThan(threshold)
                compatibilityDao.deleteOlderThan(threshold)
                personalityDao.deleteOlderThan(threshold)
                Result.success()
            }
    }
