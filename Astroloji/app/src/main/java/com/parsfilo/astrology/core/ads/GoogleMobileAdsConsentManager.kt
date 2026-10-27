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
import java.util.concurrent.atomic.AtomicLong
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

/**
 * Atomic UI projection of the last known UMP permission and refresh revision.
 * Ads loaded under an older revision must not survive a consent form update.
 */
data class AdConsentSnapshot(
    val canRequestAds: Boolean,
    val revision: Long,
)

@Singleton
class GoogleMobileAdsConsentManager
    @Inject
    constructor(
        @param:ApplicationContext private val context: Context,
    ) {
        private val consentInformation: ConsentInformation =
            UserMessagingPlatform.getConsentInformation(context)

        private val _canRequestAds = MutableStateFlow(consentInformation.canRequestAds())
        private val consentEpochCounter = AtomicLong(0L)

        /** Each UMP consent refresh or form conclusion invalidates older ads. */
        val consentRevision: Long
            get() = consentEpochCounter.get()

        val canRequestAdsFlow: StateFlow<Boolean> = _canRequestAds.asStateFlow()

        private val _consentSnapshotFlow =
            MutableStateFlow(AdConsentSnapshot(_canRequestAds.value, consentEpochCounter.get()))
        val consentSnapshotFlow: StateFlow<AdConsentSnapshot> = _consentSnapshotFlow.asStateFlow()

        private val _privacyOptionsRequired = MutableStateFlow(isPrivacyOptionsRequired)
        val privacyOptionsRequired: StateFlow<Boolean> = _privacyOptionsRequired.asStateFlow()

        val canRequestAds: Boolean
            get() = _canRequestAds.value

        val consentStatus: Int
            get() = consentInformation.consentStatus

        val isPrivacyOptionsRequired: Boolean
            get() =
                consentInformation.privacyOptionsRequirementStatus ==
                    ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED

        /** Publish permission and version together for banner lifecycle decisions. */
        private fun publishConsentUpdate() {
            val revision = consentEpochCounter.incrementAndGet()
            val allowed = consentInformation.canRequestAds()
            _canRequestAds.value = allowed
            _privacyOptionsRequired.value = isPrivacyOptionsRequired
            _consentSnapshotFlow.value = AdConsentSnapshot(allowed, revision)
        }

        suspend fun gatherConsent(activity: Activity) {
            suspendCancellableCoroutine { continuation ->
                consentInformation.requestConsentInfoUpdate(
                    activity,
                    buildRequestParameters(activity),
                    {
                        publishConsentUpdate()
                        UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity) { formError ->
                            formError?.let { Timber.w("Consent form dismissed with error: %s", it.message) }
                            publishConsentUpdate()
                            if (continuation.isActive) continuation.resume(Unit)
                        }
                    },
                    { requestError ->
                        Timber.w("Consent info update failed: %s", requestError.message)
                        publishConsentUpdate()
                        if (continuation.isActive) continuation.resume(Unit)
                    },
                )
            }
        }

        suspend fun showPrivacyOptionsForm(activity: Activity): FormError? =
            suspendCancellableCoroutine { continuation ->
                UserMessagingPlatform.showPrivacyOptionsForm(activity) { formError ->
                    publishConsentUpdate()
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
