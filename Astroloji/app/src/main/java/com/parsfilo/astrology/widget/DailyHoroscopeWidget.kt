@file:Suppress("FunctionNaming")

package com.parsfilo.astrology.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.datastore.preferences.core.Preferences
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.ImageProvider
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
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
import com.parsfilo.astrology.ui.theme.MoonMist
import com.parsfilo.astrology.ui.theme.SoftGold
import com.parsfilo.astrology.ui.theme.Starlight
import kotlinx.coroutines.flow.first

private const val FALLBACK_ENERGY_SCORE = 85

class DailyHoroscopeWidget : GlanceAppWidget() {
    override suspend fun provideGlance(
        context: Context,
        id: GlanceId,
    ) {
        val snapshot = loadSnapshot(context)
        provideContent {
            GlanceTheme {
                WidgetContent(
                    title = snapshot.title,
                    body = snapshot.body,
                    energy = snapshot.energy,
                )
            }
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
            val personalizedLine = personalizedLineSnapshot(preferences)
            if (personalizedLine != null) {
                personalizedLine
            } else {
                val entity = database.dailyDao().get(sign, TimeUtils.dateIdentifier(), language)
                entity?.toWidgetSnapshot(context) ?: fallbackWidgetSnapshot(context)
            }
        } finally {
            database.close()
        }
    }

    private fun personalizedLineSnapshot(preferences: Preferences): WidgetSnapshot? {
        val isFresh = preferences[PreferencesKeys.PERSONALIZED_LINE_DATE] == TimeUtils.dateIdentifier()
        val title = preferences[PreferencesKeys.PERSONALIZED_LINE_TITLE]
        val body = preferences[PreferencesKeys.PERSONALIZED_LINE_BODY]
        return if (isFresh && title != null && body != null) {
            WidgetSnapshot(title = title, body = body, energy = null)
        } else {
            null
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
        energy: String?,
    ) {
        Column(
            modifier =
                GlanceModifier
                    .fillMaxSize()
                    .background(ImageProvider(R.drawable.widget_premium_background))
                    .cornerRadius(18.dp)
                    .clickable(actionStartActivity<MainActivity>())
                    .padding(14.dp),
            verticalAlignment = Alignment.Vertical.CenterVertically,
        ) {
            Text(
                title,
                style =
                    TextStyle(
                        color = ColorProvider(SoftGold),
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                maxLines = 2,
            )
            Spacer(GlanceModifier.height(6.dp))
            Text(
                body,
                style = TextStyle(color = ColorProvider(Starlight), fontSize = 13.sp),
                maxLines = 3,
            )
            energy?.let {
                Spacer(GlanceModifier.height(6.dp))
                Text(
                    it,
                    style =
                        TextStyle(
                            color = ColorProvider(MoonMist),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                        ),
                    maxLines = 1,
                )
            }
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
    val energy: String?,
)
