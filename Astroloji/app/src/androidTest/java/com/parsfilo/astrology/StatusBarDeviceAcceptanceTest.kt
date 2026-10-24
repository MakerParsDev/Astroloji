package com.parsfilo.astrology

import android.content.res.Configuration
import android.os.SystemClock
import android.view.View
import androidx.core.view.WindowCompat
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Real MainActivity status-bar policy acceptance, including Android 9 and runtime theme changes. */
@RunWith(AndroidJUnit4::class)
class StatusBarDeviceAcceptanceTest {
    @Test
    fun appThemeChangesSystemBarIconsWithoutActivityRestart() {
        val target = InstrumentationRegistry.getInstrumentation().targetContext
        val originalTheme = "dark" // Only the separate, freshly installed storeQa app is used.
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            var originalActivity: MainActivity? = null
            scenario.onActivity { activity -> originalActivity = activity }
            val activity = requireNotNull(originalActivity)
            assertTrue("MainActivity must be attached to a window", activity.window.decorView.isAttachedToWindow)

            fun checkIcons(darkIcons: Boolean) {
                val deadline = SystemClock.uptimeMillis() + 7000L
                var actual = !darkIcons
                do {
                    scenario.onActivity { current ->
                        assertTrue("Theme change recreated Activity", current === activity)
                        actual = WindowCompat.getInsetsController(current.window, current.window.decorView).isAppearanceLightStatusBars
                        val legacyFlags = current.window.decorView.systemUiVisibility
                        assertEquals(
                            "WindowInsetsController and Android 9 system UI flags disagree",
                            actual,
                            legacyFlags and View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR != 0,
                        )
                    }
                    if (actual == darkIcons) break
                    Thread.sleep(100L)
                } while (SystemClock.uptimeMillis() < deadline)
                assertEquals("Incorrect status-bar icon appearance after theme update", darkIcons, actual)
            }

            fun setTheme(value: String) {
                runBlocking { activity.preferencesRepository.updateTheme(value) }
            }

            fun capture(label: String) {
                val bitmap =
                    requireNotNull(InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()) {
                        "System bar screenshot unavailable on Android device"
                    }
                val dir = java.io.File(target.getExternalFilesDir(null), "statusbar-qa")
                assertTrue(dir.mkdirs() || dir.isDirectory)
                val file = java.io.File(dir, "statusbar-$label.png")
                file.outputStream().use { output ->
                    assertTrue(bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, output))
                }
                bitmap.recycle()
            }

            try {
                setTheme("dark")
                checkIcons(darkIcons = false)
                capture("dark")
                setTheme("light")
                checkIcons(darkIcons = true)
                capture("light")
                setTheme("dark")
                checkIcons(darkIcons = false)
                setTheme("system")
                val isDeviceDark = target.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
                checkIcons(darkIcons = !isDeviceDark)
                capture("system")
            } finally {
                setTheme(originalTheme)
            }
            checkIcons(darkIcons = false)
            scenario.onActivity { current ->
                assertTrue("Activity not resumed after theme changes", current.window.decorView.isShown)
            }
        }
    }
}
