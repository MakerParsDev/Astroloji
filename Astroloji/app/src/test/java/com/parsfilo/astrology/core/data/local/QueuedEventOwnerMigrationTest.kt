package com.parsfilo.astrology.core.data.local

import android.content.Context
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.db.SupportSQLiteOpenHelper
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class QueuedEventOwnerMigrationTest {
    @Test
    fun `migration quarantines ownerless legacy analytics without deleting unrelated cached data`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val databaseName = "analytics-owner-migration-test.db"
        context.deleteDatabase(databaseName)
        val helper =
            FrameworkSQLiteOpenHelperFactory().create(
                SupportSQLiteOpenHelper.Configuration
                    .builder(context)
                    .name(databaseName)
                    .callback(
                        object : SupportSQLiteOpenHelper.Callback(4) {
                            override fun onCreate(db: SupportSQLiteDatabase) {
                                db.execSQL(
                                    "CREATE TABLE queued_events (" +
                                        "id TEXT NOT NULL PRIMARY KEY, type TEXT NOT NULL, " +
                                        "payload TEXT NOT NULL, createdAt INTEGER NOT NULL)",
                                )
                                db.execSQL("CREATE TABLE preserved_profile (id TEXT PRIMARY KEY)")
                            }

                            override fun onUpgrade(
                                db: SupportSQLiteDatabase,
                                oldVersion: Int,
                                newVersion: Int,
                            ) = Unit
                        },
                    ).build(),
            )
        try {
            val db = helper.writableDatabase
            db.execSQL(
                "INSERT INTO queued_events (id, type, payload, createdAt) " +
                    "VALUES ('legacy-unowned', 'mood_logged', '{}', 1)",
            )
            db.execSQL("INSERT INTO preserved_profile (id) VALUES ('profile-kept')")

            MIGRATION_4_5.migrate(db)

            db.query("SELECT COUNT(*) FROM queued_events").use {
                assertThat(it.moveToFirst()).isTrue()
                assertThat(it.getInt(0)).isEqualTo(0)
            }
            db.query("SELECT id FROM preserved_profile").use {
                assertThat(it.moveToFirst()).isTrue()
                assertThat(it.getString(0)).isEqualTo("profile-kept")
            }
            db.execSQL(
                "INSERT INTO queued_events (id, type, payload, createdAt, ownerUserId) " +
                    "VALUES ('new-bound', 'app_open', '{}', 2, 'owner-A')",
            )
            db.query("SELECT ownerUserId FROM queued_events WHERE id = 'new-bound'").use {
                assertThat(it.moveToFirst()).isTrue()
                assertThat(it.getString(0)).isEqualTo("owner-A")
            }
        } finally {
            helper.close()
            context.deleteDatabase(databaseName)
        }
    }
}
