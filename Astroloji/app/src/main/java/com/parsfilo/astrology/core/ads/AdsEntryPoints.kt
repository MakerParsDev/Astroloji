package com.parsfilo.astrology.core.ads

import android.content.Context
import com.parsfilo.astrology.core.data.repository.RemoteConfigRepository
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent

@EntryPoint
@InstallIn(SingletonComponent::class)
interface AdsEntryPoint {
    fun adEligibilityChecker(): AdEligibilityChecker

    fun adFrequencyManager(): AdFrequencyManager

    fun interstitialAdManager(): InterstitialAdManager

    fun remoteConfigRepository(): RemoteConfigRepository

    fun rewardedAdManager(): RewardedAdManager
}

fun adsEntryPoint(context: Context): AdsEntryPoint =
    EntryPointAccessors.fromApplication(
        context.applicationContext,
        AdsEntryPoint::class.java,
    )
