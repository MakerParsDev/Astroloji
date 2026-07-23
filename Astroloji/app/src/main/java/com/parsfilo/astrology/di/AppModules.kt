package com.parsfilo.astrology.di

import android.content.Context
import androidx.room.Room
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.remoteconfig.FirebaseRemoteConfig
import com.parsfilo.astrology.BuildConfig
import com.parsfilo.astrology.core.data.local.AstrologyDatabase
import com.parsfilo.astrology.core.data.local.CompatibilityDao
import com.parsfilo.astrology.core.data.local.DailyDao
import com.parsfilo.astrology.core.data.local.FavoriteSignDao
import com.parsfilo.astrology.core.data.local.MIGRATION_2_3
import com.parsfilo.astrology.core.data.local.MIGRATION_3_4
import com.parsfilo.astrology.core.data.local.MonthlyDao
import com.parsfilo.astrology.core.data.local.PersonalityDao
import com.parsfilo.astrology.core.data.local.QueuedEventDao
import com.parsfilo.astrology.core.data.local.UserProfileDao
import com.parsfilo.astrology.core.data.local.WeeklyDao
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.AuthInterceptor
import com.parsfilo.astrology.core.util.DispatchersProvider
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModules {
    @Provides
    @Singleton
    fun provideDispatchersProvider(): DispatchersProvider = DispatchersProvider()

    @Provides
    @Singleton
    fun provideJson(): Json =
        Json {
            ignoreUnknownKeys = true
            explicitNulls = false
            coerceInputValues = true
        }

    @Provides
    @Singleton
    fun provideOkHttpClient(authInterceptor: AuthInterceptor): OkHttpClient =
        OkHttpClient
            .Builder()
            .addInterceptor(authInterceptor)
            .build()

    @Provides
    @Singleton
    fun provideRetrofit(
        okHttpClient: OkHttpClient,
        json: Json,
    ): Retrofit =
        Retrofit
            .Builder()
            .baseUrl(BuildConfig.BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()

    @Provides
    @Singleton
    fun provideAstrologyApi(retrofit: Retrofit): AstrologyApi = retrofit.create(AstrologyApi::class.java)

    @Provides
    @Singleton
    fun provideFirebaseAuth(): FirebaseAuth = FirebaseAuth.getInstance()

    @Provides
    @Singleton
    fun provideFirebaseAnalytics(
        @ApplicationContext context: Context,
    ): FirebaseAnalytics = FirebaseAnalytics.getInstance(context)

    @Provides
    @Singleton
    fun provideFirebaseRemoteConfig(): FirebaseRemoteConfig = FirebaseRemoteConfig.getInstance()

    @Provides
    @Singleton
    fun provideDatabase(
        @ApplicationContext context: Context,
    ): AstrologyDatabase =
        Room
            .databaseBuilder(
                context,
                AstrologyDatabase::class.java,
                "astrology.db",
            ).addMigrations(
                com.parsfilo.astrology.core.data.local.MIGRATION_1_2,
                MIGRATION_2_3,
                MIGRATION_3_4,
            ).build()

    @Provides fun provideUserProfileDao(database: AstrologyDatabase): UserProfileDao = database.userProfileDao()

    @Provides fun provideDailyDao(database: AstrologyDatabase): DailyDao = database.dailyDao()

    @Provides fun provideWeeklyDao(database: AstrologyDatabase): WeeklyDao = database.weeklyDao()

    @Provides fun provideMonthlyDao(database: AstrologyDatabase): MonthlyDao = database.monthlyDao()

    @Provides fun provideCompatibilityDao(database: AstrologyDatabase): CompatibilityDao = database.compatibilityDao()

    @Provides fun providePersonalityDao(database: AstrologyDatabase): PersonalityDao = database.personalityDao()

    @Provides fun provideFavoriteSignDao(database: AstrologyDatabase): FavoriteSignDao = database.favoriteSignDao()

    @Provides fun provideQueuedEventDao(database: AstrologyDatabase): QueuedEventDao = database.queuedEventDao()

    @Provides
    @Singleton
    fun provideUserPreferencesRepository(
        @ApplicationContext context: Context,
    ): UserPreferencesRepository = UserPreferencesRepository(context)
}
