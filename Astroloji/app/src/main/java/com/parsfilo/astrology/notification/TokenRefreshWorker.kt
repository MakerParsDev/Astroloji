package com.parsfilo.astrology.notification

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.parsfilo.astrology.core.data.repository.SessionRepository
import com.parsfilo.astrology.core.util.AppResult
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

@HiltWorker
class TokenRefreshWorker
    @AssistedInject
    constructor(
        @Assisted appContext: Context,
        @Assisted workerParams: WorkerParameters,
        private val sessionRepository: SessionRepository,
    ) : CoroutineWorker(appContext, workerParams) {
        override suspend fun doWork(): Result =
            when (sessionRepository.refreshSessionToken(forceRefreshFirebaseToken = true)) {
                is AppResult.Success -> Result.success()
                is AppResult.Error -> Result.retry()
                AppResult.Loading -> Result.retry()
            }
    }
