package com.parsfilo.astrology.core.ads

import android.app.Activity
import android.content.Context
import com.google.android.ump.ConsentDebugSettings
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.FormError
import com.google.android.ump.UserMessagingPlatform
import com.parsfilo.astrology.BuildConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

@Singleton
class GoogleMobileAdsConsentManager
    @Inject
    constructor(
        @param:ApplicationContext private val context: Context,
    ) {
        private val consentInformation: ConsentInformation =
            UserMessagingPlatform.getConsentInformation(context)

        private val _canRequestAds = MutableStateFlow(consentInformation.canRequestAds())
        val canRequestAdsFlow: StateFlow<Boolean> = _canRequestAds.asStateFlow()

        val canRequestAds: Boolean
            get() = _canRequestAds.value

        val consentStatus: Int
            get() = consentInformation.consentStatus

        val isPrivacyOptionsRequired: Boolean
            get() =
                consentInformation.privacyOptionsRequirementStatus ==
                    ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED

        suspend fun gatherConsent(activity: Activity) {
            suspendCancellableCoroutine { continuation ->
                consentInformation.requestConsentInfoUpdate(
                    activity,
                    buildRequestParameters(activity),
                    {
                        _canRequestAds.value = consentInformation.canRequestAds()
                        UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity) { formError ->
                            formError?.let { Timber.w("Consent form dismissed with error: %s", it.message) }
                            _canRequestAds.value = consentInformation.canRequestAds()
                            if (continuation.isActive) continuation.resume(Unit)
                        }
                    },
                    { requestError ->
                        Timber.w("Consent info update failed: %s", requestError.message)
                        _canRequestAds.value = consentInformation.canRequestAds()
                        if (continuation.isActive) continuation.resume(Unit)
                    },
                )
            }
        }

        suspend fun showPrivacyOptionsForm(activity: Activity): FormError? =
            suspendCancellableCoroutine { continuation ->
                UserMessagingPlatform.showPrivacyOptionsForm(activity) { formError ->
                    _canRequestAds.value = consentInformation.canRequestAds()
                    if (continuation.isActive) continuation.resume(formError)
                }
            }

        private fun buildRequestParameters(activity: Activity): ConsentRequestParameters {
            val builder = ConsentRequestParameters.Builder()
            if (BuildConfig.DEBUG) {
                builder.setConsentDebugSettings(
                    ConsentDebugSettings
                        .Builder(activity)
                        .setDebugGeography(ConsentDebugSettings.DebugGeography.DEBUG_GEOGRAPHY_EEA)
                        .build(),
                )
            }
            return builder.build()
        }
    }
