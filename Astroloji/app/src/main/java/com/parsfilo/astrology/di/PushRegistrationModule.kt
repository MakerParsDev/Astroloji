package com.parsfilo.astrology.di

import com.parsfilo.astrology.core.data.push.FirebasePushRegistrationManager
import com.parsfilo.astrology.core.data.push.PushRegistrationManager
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class PushRegistrationModule {
    @Binds
    @Singleton
    abstract fun bindPushRegistrationManager(
        implementation: FirebasePushRegistrationManager,
    ): PushRegistrationManager
}
