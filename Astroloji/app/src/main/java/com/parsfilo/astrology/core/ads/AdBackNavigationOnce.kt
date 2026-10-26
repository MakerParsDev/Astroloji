package com.parsfilo.astrology.core.ads

import java.util.concurrent.atomic.AtomicBoolean

/**
 * Prevents rapid repeated BackHandler events from bypassing a full-screen ad
 * and ensures only one navigation, even with duplicate/late SDK callbacks.
 * Instances belong to one visible destination and must not be shared globally.
 */
internal class AdBackNavigationOnce {
    private val started = AtomicBoolean(false)
    private val completed = AtomicBoolean(false)

    fun tryStart(): Boolean = started.compareAndSet(false, true)

    fun complete(onNavigate: () -> Unit) {
        if (completed.compareAndSet(false, true)) onNavigate()
    }
}
