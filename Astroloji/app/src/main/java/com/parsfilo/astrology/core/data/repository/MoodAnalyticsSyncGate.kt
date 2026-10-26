package com.parsfilo.astrology.core.data.repository

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Serializes account mood-history deletion and analytics delivery.
 *
 * The lock spans the remote API write and local queue cleanup so a previously
 * dequeued mood event cannot be inserted again between those operations.
 * Only one instance exists across the WorkManager and repository components.
 */
@Singleton
class MoodAnalyticsSyncGate
    @Inject
    constructor() {
        private val mutex = Mutex()

        suspend fun <T> withLock(block: suspend () -> T): T = mutex.withLock { block() }
    }
