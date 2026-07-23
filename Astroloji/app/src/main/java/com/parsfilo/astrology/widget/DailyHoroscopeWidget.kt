package com.parsfilo.astrology.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.datastore.preferences.core.Preferences
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Column
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.text.Text
import androidx.room.Room
import com.parsfilo.astrology.MainActivity
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.data.local.AstrologyDatabase
import com.parsfilo.astrology.core.data.local.DailyHoroscopeEntity
import com.parsfilo.astrology.core.data.local.MIGRATION_1_2
import com.parsfilo.astrology.core.data.local.MIGRATION_2_3
import com.parsfilo.astrology.core.data.local.MIGRATION_3_4
import com.parsfilo.astrology.core.data.preferences.PreferencesKeys
import com.parsfilo.astrology.core.data.preferences.userPreferencesDataStore
import com.parsfilo.astrology.core.util.TimeUtils
import kotlinx.coroutines.flow.first

private const val FALLBACK_ENERGY_SCORE = 85

class DailyHoroscopeWidget : GlanceAppWidget() {
    override suspend fun provideGlance(
        context: Context,
        id: GlanceId,
    ) {
        val snapshot = loadSnapshot(context)
        provideContent {
            WidgetContent(
                title = snapshot.title,
                body = snapshot.body,
                energy = snapshot.energy,
            )
        }
    }

    private suspend fun loadSnapshot(context: Context): WidgetSnapshot {
        val preferences = context.userPreferencesDataStore.data.first()
        val sign = preferences.stringValue(PreferencesKeys.SELECTED_SIGN, "aries")
        val language = preferences.stringValue(PreferencesKeys.LANGUAGE, TimeUtils.defaultLanguageTag())
        val database =
            Room
                .databaseBuilder(
                    context,
                    AstrologyDatabase::class.java,
                    "astrology.db",
                ).addMigrations(MIGRATION_1_2)
                .addMigrations(MIGRATION_2_3)
                .addMigrations(MIGRATION_3_4)
                .build()

        return try {
            val entity = database.dailyDao().get(sign, TimeUtils.dateIdentifier(), language)
            entity?.toWidgetSnapshot(context) ?: fallbackWidgetSnapshot(context)
        } finally {
            database.close()
        }
    }

    private fun DailyHoroscopeEntity.toWidgetSnapshot(context: Context): WidgetSnapshot =
        WidgetSnapshot(
            title = context.getString(R.string.widget_daily_title),
            body = short,
            energy = context.getString(R.string.widget_daily_energy, energy),
        )

    private fun fallbackWidgetSnapshot(context: Context): WidgetSnapshot =
        WidgetSnapshot(
            title = context.getString(R.string.widget_daily_title),
            body = context.getString(R.string.widget_daily_body),
            energy = context.getString(R.string.widget_daily_energy, FALLBACK_ENERGY_SCORE),
        )

    @Composable
    private fun WidgetContent(
        title: String,
        body: String,
        energy: String,
    ) {
        Column(
            modifier =
                GlanceModifier
                    .fillMaxSize()
                    .background(androidx.glance.unit.ColorProvider(android.graphics.Color.parseColor("#16162A")))
                    .padding(12.dp)
                    .clickable(actionStartActivity<MainActivity>()),
        ) {
            Text(title)
            Text(body)
            Text(energy)
        }
    }

    private fun Preferences.stringValue(
        key: Preferences.Key<String>,
        defaultValue: String,
    ): String = this[key] ?: defaultValue
}

class DailyHoroscopeWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DailyHoroscopeWidget()
}

private data class WidgetSnapshot(
    val title: String,
    val body: String,
    val energy: String,
)
