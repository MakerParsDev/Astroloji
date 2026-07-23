package com.parsfilo.astrology.core.data.local

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * v1 → v2: Added `language` column to primary keys of daily_horoscope,
 * weekly_horoscope, monthly_horoscope, and compatibility cache tables.
 * SQLite does not support altering primary keys, so cache tables are dropped
 * and recreated. user_profile, favorite_signs, and queued_events are unchanged.
 */
val MIGRATION_1_2 =
    object : Migration(1, 2) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // Drop affected cache tables (no user data, safe to recreate)
            db.execSQL("DROP TABLE IF EXISTS `daily_horoscope`")
            db.execSQL("DROP TABLE IF EXISTS `weekly_horoscope`")
            db.execSQL("DROP TABLE IF EXISTS `monthly_horoscope`")
            db.execSQL("DROP TABLE IF EXISTS `compatibility`")

            // Recreate with new composite primary keys that include language
            db.execSQL(
                "CREATE TABLE IF NOT EXISTS `daily_horoscope` " +
                    "(`sign` TEXT NOT NULL, `date` TEXT NOT NULL, `language` TEXT NOT NULL, " +
                    "`short` TEXT NOT NULL, `full` TEXT, `love` TEXT, `career` TEXT, " +
                    "`money` TEXT, `health` TEXT, `dailyTip` TEXT, `luckyNumber` INTEGER NOT NULL, " +
                    "`luckyColor` TEXT NOT NULL, `energy` INTEGER NOT NULL, `loveScore` INTEGER NOT NULL, " +
                    "`careerScore` INTEGER NOT NULL, `cachedAt` INTEGER NOT NULL, " +
                    "PRIMARY KEY(`sign`, `date`, `language`))",
            )
            db.execSQL(
                "CREATE TABLE IF NOT EXISTS `weekly_horoscope` " +
                    "(`sign` TEXT NOT NULL, `week` TEXT NOT NULL, `weekStart` TEXT NOT NULL, " +
                    "`weekEnd` TEXT NOT NULL, `language` TEXT NOT NULL, `summary` TEXT, " +
                    "`love` TEXT, `career` TEXT, `money` TEXT, `bestDay` TEXT, `warning` TEXT, " +
                    "`cachedAt` INTEGER NOT NULL, " +
                    "PRIMARY KEY(`sign`, `week`, `language`))",
            )
            db.execSQL(
                "CREATE TABLE IF NOT EXISTS `monthly_horoscope` " +
                    "(`sign` TEXT NOT NULL, `month` TEXT NOT NULL, `language` TEXT NOT NULL, " +
                    "`summary` TEXT, `love` TEXT, `career` TEXT, `money` TEXT, " +
                    "`bestDay` TEXT, `warning` TEXT, `cachedAt` INTEGER NOT NULL, " +
                    "PRIMARY KEY(`sign`, `month`, `language`))",
            )
            db.execSQL(
                "CREATE TABLE IF NOT EXISTS `compatibility` " +
                    "(`sign1` TEXT NOT NULL, `sign2` TEXT NOT NULL, `language` TEXT NOT NULL, " +
                    "`overallScore` INTEGER NOT NULL, `loveScore` INTEGER NOT NULL, " +
                    "`friendshipScore` INTEGER NOT NULL, `workScore` INTEGER NOT NULL, " +
                    "`summary` TEXT NOT NULL, `strengths` TEXT NOT NULL, `challenges` TEXT NOT NULL, " +
                    "`advice` TEXT, `famousCouples` TEXT, `cachedAt` INTEGER NOT NULL, " +
                    "PRIMARY KEY(`sign1`, `sign2`, `language`))",
            )
        }
    }

val MIGRATION_2_3 =
    object : Migration(2, 3) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL("ALTER TABLE `daily_horoscope` ADD COLUMN `moneyScore` INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE `daily_horoscope` ADD COLUMN `healthScore` INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE `monthly_horoscope` ADD COLUMN `monthStart` TEXT")
            db.execSQL("ALTER TABLE `monthly_horoscope` ADD COLUMN `monthEnd` TEXT")
        }
    }

val MIGRATION_3_4 =
    object : Migration(3, 4) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL("ALTER TABLE `user_profile` ADD COLUMN `subscriptionState` TEXT NOT NULL DEFAULT 'none'")
        }
    }
