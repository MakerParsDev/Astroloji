package com.parsfilo.astrology.core.data.local

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase

@Entity(tableName = "user_profile")
data class UserProfileEntity(
    @PrimaryKey val userId: String,
    val sign: String,
    val language: String,
    val isPremium: Boolean,
    val subscriptionState: String,
    val premiumExpiresAt: Long?,
    val jwt: String,
    val utcOffset: Int,
    val notificationEnabled: Boolean,
    val notificationHour: Int,
    val updatedAt: Long,
)

@Entity(tableName = "daily_horoscope", primaryKeys = ["sign", "date", "language"])
data class DailyHoroscopeEntity(
    val sign: String,
    val date: String,
    val language: String,
    val short: String,
    val full: String?,
    val love: String?,
    val career: String?,
    val money: String?,
    val health: String?,
    val dailyTip: String?,
    val luckyNumber: Int,
    val luckyColor: String,
    val energy: Int,
    val loveScore: Int,
    val careerScore: Int,
    val moneyScore: Int,
    val healthScore: Int,
    val cachedAt: Long,
)

@Entity(tableName = "weekly_horoscope", primaryKeys = ["sign", "week", "language"])
data class WeeklyHoroscopeEntity(
    val sign: String,
    val week: String,
    val weekStart: String,
    val weekEnd: String,
    val language: String,
    val summary: String?,
    val love: String?,
    val career: String?,
    val money: String?,
    val bestDay: String?,
    val warning: String?,
    val cachedAt: Long,
)

@Entity(tableName = "monthly_horoscope", primaryKeys = ["sign", "month", "language"])
data class MonthlyHoroscopeEntity(
    val sign: String,
    val month: String,
    val language: String,
    val monthStart: String?,
    val monthEnd: String?,
    val summary: String?,
    val love: String?,
    val career: String?,
    val money: String?,
    val bestDay: String?,
    val warning: String?,
    val cachedAt: Long,
)

@Entity(tableName = "compatibility", primaryKeys = ["sign1", "sign2", "language"])
data class CompatibilityEntity(
    val sign1: String,
    val sign2: String,
    val language: String,
    val overallScore: Int,
    val loveScore: Int,
    val friendshipScore: Int,
    val workScore: Int,
    val summary: String,
    val strengths: String,
    val challenges: String,
    val advice: String?,
    val famousCouples: String?,
    val cachedAt: Long,
)

@Entity(tableName = "personality", primaryKeys = ["sign", "language"])
data class PersonalityEntity(
    val sign: String,
    val language: String,
    val summary: String,
    val deepAnalysis: String?,
    val strengths: String,
    val weaknesses: String,
    val idealPartners: String,
    val careerFit: String?,
    val element: String,
    val planet: String,
    val color: String,
    val stone: String,
    val cachedAt: Long,
)

@Entity(tableName = "favorite_signs")
data class FavoriteSignEntity(
    @PrimaryKey val sign: String,
    val addedAt: Long,
)

@Entity(tableName = "queued_events")
data class QueuedEventEntity(
    @PrimaryKey val id: String,
    val type: String,
    val payload: String,
    val createdAt: Long,
)

@Dao
interface UserProfileDao {
    @Query("SELECT * FROM user_profile LIMIT 1")
    suspend fun getProfile(): UserProfileEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(profile: UserProfileEntity)

    @Query("DELETE FROM user_profile")
    suspend fun clear()
}

@Dao
interface DailyDao {
    @Query("SELECT * FROM daily_horoscope WHERE sign = :sign AND date = :date AND language = :language LIMIT 1")
    suspend fun get(
        sign: String,
        date: String,
        language: String,
    ): DailyHoroscopeEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: DailyHoroscopeEntity)

    @Query("DELETE FROM daily_horoscope WHERE cachedAt < :minCachedAt")
    suspend fun deleteOlderThan(minCachedAt: Long)
}

@Dao
interface WeeklyDao {
    @Query("SELECT * FROM weekly_horoscope WHERE sign = :sign AND week = :week AND language = :language LIMIT 1")
    suspend fun get(
        sign: String,
        week: String,
        language: String,
    ): WeeklyHoroscopeEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: WeeklyHoroscopeEntity)

    @Query("DELETE FROM weekly_horoscope WHERE cachedAt < :minCachedAt")
    suspend fun deleteOlderThan(minCachedAt: Long)
}

@Dao
interface MonthlyDao {
    @Query("SELECT * FROM monthly_horoscope WHERE sign = :sign AND month = :month AND language = :language LIMIT 1")
    suspend fun get(
        sign: String,
        month: String,
        language: String,
    ): MonthlyHoroscopeEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: MonthlyHoroscopeEntity)

    @Query("DELETE FROM monthly_horoscope WHERE cachedAt < :minCachedAt")
    suspend fun deleteOlderThan(minCachedAt: Long)
}

@Dao
interface CompatibilityDao {
    @Query("SELECT * FROM compatibility WHERE sign1 = :sign1 AND sign2 = :sign2 AND language = :language LIMIT 1")
    suspend fun get(
        sign1: String,
        sign2: String,
        language: String,
    ): CompatibilityEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: CompatibilityEntity)

    @Query("DELETE FROM compatibility WHERE cachedAt < :minCachedAt")
    suspend fun deleteOlderThan(minCachedAt: Long)
}

@Dao
interface PersonalityDao {
    @Query("SELECT * FROM personality WHERE sign = :sign AND language = :language LIMIT 1")
    suspend fun get(
        sign: String,
        language: String,
    ): PersonalityEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: PersonalityEntity)

    @Query("DELETE FROM personality WHERE cachedAt < :minCachedAt")
    suspend fun deleteOlderThan(minCachedAt: Long)
}

@Dao
interface FavoriteSignDao {
    @Query("SELECT * FROM favorite_signs ORDER BY addedAt DESC")
    suspend fun getAll(): List<FavoriteSignEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: FavoriteSignEntity)

    @Query("DELETE FROM favorite_signs WHERE sign = :sign")
    suspend fun delete(sign: String)
}

@Dao
interface QueuedEventDao {
    @Query("SELECT * FROM queued_events ORDER BY createdAt ASC")
    suspend fun getAll(): List<QueuedEventEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: QueuedEventEntity)

    @Query("DELETE FROM queued_events WHERE id = :id")
    suspend fun delete(id: String)
}

@Database(
    entities = [
        UserProfileEntity::class,
        DailyHoroscopeEntity::class,
        WeeklyHoroscopeEntity::class,
        MonthlyHoroscopeEntity::class,
        CompatibilityEntity::class,
        PersonalityEntity::class,
        FavoriteSignEntity::class,
        QueuedEventEntity::class,
    ],
    version = 4,
    exportSchema = true,
)
abstract class AstrologyDatabase : RoomDatabase() {
    abstract fun userProfileDao(): UserProfileDao

    abstract fun dailyDao(): DailyDao

    abstract fun weeklyDao(): WeeklyDao

    abstract fun monthlyDao(): MonthlyDao

    abstract fun compatibilityDao(): CompatibilityDao

    abstract fun personalityDao(): PersonalityDao

    abstract fun favoriteSignDao(): FavoriteSignDao

    abstract fun queuedEventDao(): QueuedEventDao
}
