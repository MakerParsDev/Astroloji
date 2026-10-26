package com.parsfilo.astrology.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.pm.PackageManager
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.parsfilo.astrology.MainActivity
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Verifies that the non-list widget keeps its normal entry points after disabling stale Glance trampolines. */
@RunWith(AndroidJUnit4::class)
class WidgetTrampolineManifestTest {
    @Suppress("DEPRECATION")
    @Test
    fun unusedGlanceTrampolinesAreDisabledButWidgetAndAppRemainAvailable() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val packageManager = context.packageManager
        val packageName = context.packageName

        listOf(
            "androidx.glance.appwidget.action.InvisibleActionTrampolineActivity",
            "androidx.glance.appwidget.action.ActionTrampolineActivity",
        ).forEach { activityName ->
            val info =
                packageManager.getActivityInfo(
                    ComponentName(packageName, activityName),
                    PackageManager.GET_DISABLED_COMPONENTS,
                )
            assertFalse("Unused Glance trampoline must not start: $activityName", info.enabled)
        }

        assertTrue(packageManager.getActivityInfo(ComponentName(context, MainActivity::class.java), 0).enabled)
        val provider = ComponentName(context, DailyHoroscopeWidgetReceiver::class.java)
        assertTrue(packageManager.getReceiverInfo(provider, 0).enabled)
        assertTrue(
            "Horoscope widget must still be discoverable by the launcher",
            AppWidgetManager.getInstance(context).installedProviders.any { it.provider == provider },
        )
    }
}
